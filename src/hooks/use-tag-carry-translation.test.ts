// @vitest-environment jsdom
/**
 * L2b：真 `StudioProvider`（真表单 reducer）+ 真 hook；只假网络——翻译那一条在 api-client
 * 上替掉，Provider 挂上要拉的几条走 `studioServer()`。断言的是表单里那几格最后变成什么。
 */
import { act, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ userId: 'user-a', isLoaded: true, isSignedIn: true }),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/image',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/studio/image',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

const translate = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  translatePromptToTagsAPI: translate,
}))

import { ASSISTANT_OPERATOR_MODEL_KEY_MISSING_CODE } from '@/constants/assistant-operator'
import { StudioProvider, useStudioForm } from '@/contexts/studio-context'
import { useTagCarryTranslation } from '@/hooks/use-tag-carry-translation'
import { renderHookWithApp } from '@/test/app-harness'
import { carrySentenceToTags, studioServer } from '@/test/studio-harness'

function renderBench(modelId?: string) {
  return renderHookWithApp(
    () => ({
      form: useStudioForm(),
      carry: useTagCarryTranslation(modelId),
    }),
    { inner: StudioProvider },
  )
}

type Bench = ReturnType<typeof renderBench>['result']

function carry(result: Bench, sentence: string) {
  act(() => carrySentenceToTags(result.current.form.dispatch, sentence))
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  studioServer()
})

describe('useTagCarryTranslation', () => {
  it('把带过来的那一句翻好，原地换成一串标签', async () => {
    translate.mockResolvedValue({
      success: true,
      data: { tags: '1girl, solo, rain' },
    })
    const { result } = renderBench('nai-diffusion-4-5-full')

    carry(result, 'a girl in the rain')
    expect(result.current.carry.status).toBe('translating')

    await waitFor(() =>
      expect(result.current.form.state.tagChips.map((c) => c.text)).toEqual([
        '1girl',
        'solo',
        'rain',
      ]),
    )
    expect(result.current.form.state.tagCarrySource).toBeNull()
    expect(result.current.carry.status).toBe('idle')
    expect(translate).toHaveBeenCalledWith({
      prompt: 'a girl in the rain',
      modelId: 'nai-diffusion-4-5-full',
    })
  })

  it('同一句跨重挂只发一次请求', async () => {
    translate.mockResolvedValue({
      success: true,
      data: { tags: 'city, night, neon lights' },
    })

    const first = renderBench()
    carry(first.result, 'neon city at night')
    first.unmount()

    const { result } = renderBench()
    carry(result, 'neon city at night')

    await waitFor(() =>
      expect(result.current.form.state.tagCarrySource).toBeNull(),
    )
    expect(result.current.form.state.tagChips.map((c) => c.text)).toEqual([
      'city',
      'night',
      'neon lights',
    ])
    expect(translate).toHaveBeenCalledTimes(1)
  })

  it('翻失败留着那一句，点重试再翻', async () => {
    translate.mockResolvedValueOnce({ success: false, error: 'down' })
    const { result } = renderBench()

    carry(result, 'a cat on a windowsill')
    await waitFor(() => expect(result.current.carry.status).toBe('failed'))
    expect(result.current.form.state.tagChips.map((c) => c.text)).toEqual([
      'a cat on a windowsill',
    ])

    translate.mockResolvedValueOnce({
      success: true,
      data: { tags: 'cat, windowsill' },
    })
    act(() => result.current.carry.retry())
    expect(result.current.carry.status).toBe('translating')

    await waitFor(() =>
      expect(result.current.form.state.tagChips.map((c) => c.text)).toEqual([
        'cat',
        'windowsill',
      ]),
    )
    expect(translate).toHaveBeenCalledTimes(2)
  })

  /**
   * 「全跟助手」（owner 2026-10-15）：翻译用的是助手那一家。那一家跑不了（选定模型缺 key /
   * 一家都没配）时把那句原因交给小字照实说；别的失败只说「没成」。
   */
  it('助手那一家跑不了：把原因交出来', async () => {
    translate.mockResolvedValueOnce({
      success: false,
      error: 'Claude has no key',
      errorCode: ASSISTANT_OPERATOR_MODEL_KEY_MISSING_CODE,
      i18nKey: 'errors.assistant.modelKeyMissing',
    })
    const { result } = renderBench()

    carry(result, 'a fox in the snow')

    await waitFor(() => expect(result.current.carry.status).toBe('failed'))
    expect(result.current.carry.reason).toEqual({
      error: 'Claude has no key',
      errorCode: ASSISTANT_OPERATOR_MODEL_KEY_MISSING_CODE,
      i18nKey: 'errors.assistant.modelKeyMissing',
    })
  })

  it('一般失败不给原因', async () => {
    translate.mockResolvedValueOnce({
      success: false,
      error: 'not a tag list',
      errorCode: 'PROMPT_TAGS_UNUSABLE',
    })
    const { result } = renderBench()

    carry(result, 'a heron at dawn')

    await waitFor(() => expect(result.current.carry.status).toBe('failed'))
    expect(result.current.carry.reason).toBeNull()
  })

  it('不在标签台就不翻', () => {
    const { result } = renderBench()

    act(() =>
      result.current.form.dispatch({
        type: 'SET_PROMPT',
        payload: 'a quiet lake',
      }),
    )

    expect(result.current.carry.status).toBe('idle')
    expect(translate).not.toHaveBeenCalled()
  })
})
