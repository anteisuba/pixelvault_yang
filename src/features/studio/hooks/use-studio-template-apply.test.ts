// @vitest-environment jsdom
import { act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { RecipeRecord } from '@/types'
import { message } from '@/test/app-harness'
import {
  fakeStudioServer,
  renderHookWithStudio,
  type StudioHandle,
} from '@/test/studio-harness'
import { useStudioTemplateApply } from './use-studio-template-apply'

const mocks = vi.hoisted(() => ({
  search: '',
  replace: vi.fn(),
  getRecipe: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mocks.search),
}))
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn() }),
  usePathname: () => '/studio/image/tags',
}))
vi.mock('@/lib/api-client/recipes', () => ({
  getRecipeAPI: (...args: unknown[]) => mocks.getRecipe(...args),
}))
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-a' }),
}))
vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }))

const RECIPE = {
  id: 'r1',
  name: '雨夜人像',
  modelId: 'gpt-image-2',
  outputType: 'IMAGE',
  compiledPrompt: 'rainy night portrait',
  negativePrompt: null,
  version: 3,
  params: { aspectRatio: '9:16', advancedParams: { seed: 42 } },
} as unknown as RecipeRecord

/** 套用之前的工作台：自然语言或标签台，各自写好一份「原来的」。 */
function seed(studio: StudioHandle, dialect: 'natural' | 'tags') {
  act(() => {
    studio.dispatch({
      type: 'SET_OPTION_ID',
      payload: 'workspace:seedream-5.0-lite',
    })
    studio.dispatch({ type: 'SET_PROMPT_DIALECT', payload: dialect })
    if (dialect === 'tags') {
      studio.dispatch({
        type: 'SET_ADVANCED_PARAMS',
        payload: {
          negativePrompt: 'lowres',
          novelAiLayout: {
            positioning: 'auto',
            characters: [
              {
                prompt: 'blue hair',
                negativePrompt: '',
                position: { x: 0.5, y: 0.5 },
              },
            ],
          },
        },
      })
      studio.dispatch({
        type: 'SET_TAG_CHIPS',
        payload: {
          polarity: 'positive',
          chips: [{ text: '1girl', weight: 1 }],
        },
      })
      studio.dispatch({ type: 'SET_ACTIVE_TAG_CHARACTER', payload: 0 })
    } else {
      studio.dispatch({ type: 'SET_PROMPT', payload: '原来的提示词' })
      studio.dispatch({
        type: 'SET_ADVANCED_PARAMS',
        payload: { negativePrompt: 'lowres' },
      })
    }
  })
}

function renderApply(dialect: 'natural' | 'tags' = 'natural') {
  const view = renderHookWithStudio(() => useStudioTemplateApply([]))
  seed(view.result.current.studio, dialect)
  return view
}

describe('模板套用 + 撤销', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fakeStudioServer()
    mocks.search = ''
  })
  afterEach(() => vi.unstubAllGlobals())

  it('自然语言台：套上之后能按快照原样撤回', () => {
    const { result } = renderApply('natural')
    const before = result.current.studio.state
    act(() => result.current.value.apply(RECIPE))
    const applied = result.current.studio.state
    expect(applied.prompt).toBe('rainy night portrait')
    expect(applied.selectedOptionId).toBe('workspace:gpt-image-2')
    expect(applied.aspectRatio).toBe('9:16')
    expect(applied.recipeUsage).toMatchObject({ recipeId: 'r1' })
    expect(result.current.value.appliedName).toBe('雨夜人像')

    act(() => result.current.value.undo())
    const undone = result.current.studio.state
    expect(undone.prompt).toBe('原来的提示词')
    expect(undone.selectedOptionId).toBe('workspace:seedream-5.0-lite')
    expect(undone.aspectRatio).toBe(before.aspectRatio)
    expect(undone.advancedParams).toEqual({ negativePrompt: 'lowres' })
    expect(undone.recipeUsage).toBeNull()
    expect(undone.selectedWorkflowId).toBe(before.selectedWorkflowId)
    // 提示条还在淡出：名字留着，但不能再撤第二次；淡完 `dismiss` 才摘。
    expect(result.current.value.appliedName).toBe('雨夜人像')
    act(() => {
      result.current.studio.dispatch({ type: 'SET_PROMPT', payload: '又改了' })
    })
    act(() => result.current.value.undo())
    expect(result.current.studio.state.prompt).toBe('又改了')
    act(() => result.current.value.dismiss())
    expect(result.current.value.appliedName).toBeNull()
  })

  it('标签台：撤回写回标签与角色位，⛔ 不走 SET_PROMPT（会清掉画风与画师串）', () => {
    const { result } = renderApply('tags')
    act(() =>
      result.current.value.apply({
        ...RECIPE,
        compiledPrompt: '2girls',
        negativePrompt: 'watermark',
        params: { promptDialect: 'tags', advancedParams: {} },
      } as RecipeRecord),
    )
    expect(result.current.studio.state.tagChips).toEqual([
      { text: '2girls', weight: 1 },
    ])

    act(() => result.current.value.undo())
    const state = result.current.studio.state
    expect(state.tagChips).toEqual([{ text: '1girl', weight: 1 }])
    expect(state.tagNegativeChips).toEqual([{ text: 'lowres', weight: 1 }])
    expect(state.activeTagCharacterIndex).toBe(0)
    expect(state.advancedParams.novelAiLayout?.characters).toHaveLength(1)
  })

  it('没套过时撤销什么都不做；收起提示后也不能再撤', () => {
    const { result } = renderApply('natural')
    act(() => result.current.value.undo())
    expect(result.current.studio.state.prompt).toBe('原来的提示词')
    act(() => result.current.value.apply(RECIPE))
    act(() => result.current.value.dismiss())
    act(() => result.current.value.undo())
    expect(result.current.studio.state.prompt).toBe('rainy night portrait')
  })

  /**
   * 提示词页「使用 → 用在标签台」带 `?template=` 过来（pages/prompts.md）：取回来照这一台
   * 的套用走（带撤销），装一次就拿掉参数；方言还没切到标签台时先不套。
   */
  it('标签台带 ?template=：取回来套上、出撤销条，参数拿掉', async () => {
    mocks.search = 'template=r9&x=1'
    const recipe = {
      ...RECIPE,
      id: 'r9',
      name: '雨夜 · 撑伞',
      compiledPrompt: 'umbrella, rain',
    } as RecipeRecord
    mocks.getRecipe.mockResolvedValue({ success: true, data: recipe })

    const { result } = renderApply('tags')

    await waitFor(() =>
      expect(result.current.studio.state.tagChips).toEqual([
        { text: 'umbrella', weight: 1 },
        { text: 'rain', weight: 1 },
      ]),
    )
    expect(mocks.getRecipe).toHaveBeenCalledWith('r9')
    expect(mocks.replace).toHaveBeenCalledWith('/studio/image/tags?x=1', {
      scroll: false,
    })
    expect(result.current.value.appliedName).toBe('雨夜 · 撑伞')
  })

  it('自然语言台不接 ?template=；取不回来就说一句', async () => {
    mocks.search = 'template=r9'
    mocks.getRecipe.mockResolvedValue({ success: false, error: 'Not found' })
    const { result } = renderApply('natural')
    expect(mocks.getRecipe).not.toHaveBeenCalled()

    act(() => {
      result.current.studio.dispatch({
        type: 'SET_PROMPT_DIALECT',
        payload: 'tags',
      })
    })
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        message('StudioTemplates.loadFailed'),
      ),
    )
    expect(result.current.value.appliedName).toBeNull()
  })
})
