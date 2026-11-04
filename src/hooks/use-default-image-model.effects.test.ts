// @vitest-environment jsdom
/**
 * L2b：真 `StudioProvider`（真表单 reducer）+ 真 hook。断言表单最后选中的是哪个型号、
 * 「上次使用」那格记没记——不断言派发了什么 action。
 */
import { act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  STUDIO_LAST_IMAGE_MODEL_STORAGE_KEY,
  STUDIO_LAST_TAGS_MODEL_STORAGE_KEY,
} from '@/constants/studio'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { StudioModelOption } from '@/types/model-option'

const pathname = vi.hoisted(() => ({ current: '/zh/studio/image' }))
vi.mock('next/navigation', () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => pathname.current.replace(/^\/zh/, ''),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ userId: 'user-a', isLoaded: true, isSignedIn: true }),
}))

import { StudioProvider, useStudioForm } from '@/contexts/studio-context'
import { useDefaultImageModel } from '@/hooks/use-default-image-model'
import { renderHookWithApp } from '@/test/app-harness'
import { studioServer } from '@/test/studio-harness'

const option = (
  optionId: string,
  modelId: string,
  extra: Partial<StudioModelOption> = {},
): StudioModelOption => ({
  optionId,
  modelId,
  adapterType: AI_ADAPTER_TYPES.FAL,
  providerConfig: { label: 'fal.ai', baseUrl: '' },
  requestCount: 1,
  isBuiltIn: true,
  sourceType: 'workspace',
  ...extra,
})

const OPTIONS: StudioModelOption[] = [
  option('workspace:flux-2-pro', 'flux-2-pro', { providerKeyId: 'k-1' }),
  option('workspace:flux-2-flash', 'flux-2-flash', { providerKeyId: 'k-1' }),
  option('workspace:recraft-v4-pro', 'recraft-v4-pro'),
]

function renderBench(options: readonly StudioModelOption[] = OPTIONS) {
  return renderHookWithApp(
    () => {
      const form = useStudioForm()
      useDefaultImageModel(options)
      return form
    },
    { inner: StudioProvider },
  )
}

const stored = () =>
  window.localStorage.getItem(STUDIO_LAST_IMAGE_MODEL_STORAGE_KEY)

describe('useDefaultImageModel', () => {
  beforeEach(() => {
    window.localStorage.clear()
    pathname.current = '/zh/studio/image'
    studioServer()
  })

  it('图片台：自动选上配了 key 的最便宜那个；自动补位不写「上次使用」', () => {
    const { result } = renderBench()

    expect(result.current.state.selectedOptionId).toBe('workspace:flux-2-flash')
    expect(result.current.state.modelSelectionTouched).toBe(false)
    expect(stored()).toBeNull()
  })

  it('记着上次用的就恢复它，而不是最便宜的', () => {
    window.localStorage.setItem(
      STUDIO_LAST_IMAGE_MODEL_STORAGE_KEY,
      'workspace:flux-2-pro',
    )
    const { result } = renderBench()

    expect(result.current.state.selectedOptionId).toBe('workspace:flux-2-pro')
  })

  it('她亲手选的才记成「上次使用」', () => {
    const { result } = renderBench()

    act(() =>
      result.current.dispatch({
        type: 'SET_OPTION_ID',
        payload: 'workspace:flux-2-pro',
      }),
    )

    expect(stored()).toBe('workspace:flux-2-pro')
  })

  it('她故意清空了：保持空着，不再补位', () => {
    const { result } = renderBench()

    act(() => result.current.dispatch({ type: 'SET_OPTION_ID', payload: null }))

    expect(result.current.state.selectedOptionId).toBeNull()
  })

  it('切到标签台时，过渡中的那个自然语言型号 ⛔ 不记进标签台的「上次使用」', () => {
    const { result } = renderBench()
    act(() =>
      result.current.dispatch({
        type: 'SET_OPTION_ID',
        payload: 'workspace:flux-2-pro',
      }),
    )

    act(() =>
      result.current.dispatch({ type: 'SET_PROMPT_DIALECT', payload: 'tags' }),
    )

    expect(
      window.localStorage.getItem(STUDIO_LAST_TAGS_MODEL_STORAGE_KEY),
    ).toBeNull()
  })

  it('视频台路由上什么都不做', () => {
    pathname.current = '/zh/studio/video'
    const { result } = renderBench()

    expect(result.current.state.selectedOptionId).toBeNull()
  })

  it('当前不是出图模态：什么都不做', () => {
    // 名单晚到一拍（真页面里型号名单是异步来的）：先切到视频，再给名单。
    const options = { current: [] as StudioModelOption[] }
    const { result, rerender } = renderHookWithApp(
      () => {
        const form = useStudioForm()
        useDefaultImageModel(options.current)
        return form
      },
      { inner: StudioProvider },
    )
    act(() =>
      result.current.dispatch({ type: 'SET_OUTPUT_TYPE', payload: 'video' }),
    )
    options.current = OPTIONS
    rerender()

    expect(result.current.state.selectedOptionId).toBeNull()
  })

  it('一家 key 都没配：保持空着', () => {
    const { result } = renderBench([option('workspace:bare', 'flux-2-flash')])

    expect(result.current.state.selectedOptionId).toBeNull()
  })
})
