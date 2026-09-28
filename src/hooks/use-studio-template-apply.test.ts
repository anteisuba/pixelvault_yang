import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { RecipeRecord } from '@/types'

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  applyRecipe: vi.fn(),
  applyTagTemplate: vi.fn(),
  dialect: 'natural' as 'natural' | 'tags',
  search: '',
  replace: vi.fn(),
  getRecipe: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mocks.search),
}))
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => '/studio/image/tags',
}))
vi.mock('@/lib/api-client/recipes', () => ({
  getRecipeAPI: (...args: unknown[]) => mocks.getRecipe(...args),
}))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }))

vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: () => ({
    state: {
      selectedWorkflowId: 'quick-image',
      workflowMode: 'quick',
      selectedOptionId: 'workspace:seedream-5.0-lite',
      prompt: '原来的提示词',
      aspectRatio: '1:1',
      advancedParams: { negativePrompt: 'lowres' },
      tagChips: [{ text: '1girl', weight: 1 }],
      tagNegativeChips: [{ text: 'lowres', weight: 1 }],
      activeTagCharacterIndex: 0,
      recipeUsage: null,
      promptDialect: mocks.dialect,
    },
    dispatch: mocks.dispatch,
  }),
}))
vi.mock('@/hooks/use-studio-prompt-templates', () => ({
  useStudioPromptTemplates: () => ({
    handleApplyRecipe: mocks.applyRecipe,
    handleApplyTagTemplate: mocks.applyTagTemplate,
  }),
}))

import { useStudioTemplateApply } from './use-studio-template-apply'

const RECIPE = {
  id: 'r1',
  name: '雨夜人像',
  modelId: 'gpt-image-2',
} as RecipeRecord

describe('模板套用 + 撤销', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.dialect = 'natural'
    mocks.search = ''
  })

  it('自然语言台：套上之后能按快照原样撤回', () => {
    const { result } = renderHook(() => useStudioTemplateApply([]))
    act(() => result.current.apply(RECIPE))
    expect(mocks.applyRecipe).toHaveBeenCalledWith(RECIPE)
    expect(result.current.appliedName).toBe('雨夜人像')

    act(() => result.current.undo())
    const actions = mocks.dispatch.mock.calls.map(([action]) => action)
    expect(actions).toContainEqual({
      type: 'SET_PROMPT',
      payload: '原来的提示词',
    })
    expect(actions).toContainEqual({
      type: 'SET_OPTION_ID',
      payload: 'workspace:seedream-5.0-lite',
    })
    expect(actions).toContainEqual({ type: 'SET_ASPECT_RATIO', payload: '1:1' })
    expect(actions).toContainEqual({
      type: 'SET_ADVANCED_PARAMS',
      payload: { negativePrompt: 'lowres' },
    })
    expect(actions).toContainEqual({ type: 'SET_RECIPE_USAGE', payload: null })
    expect(actions).toContainEqual({
      type: 'SET_SELECTED_WORKFLOW_ID',
      payload: 'quick-image',
      openDefaultPanel: false,
    })
    // 提示条还在淡出：名字留着，但不能再撤第二次；淡完 `dismiss` 才摘。
    expect(result.current.appliedName).toBe('雨夜人像')
    const dispatched = mocks.dispatch.mock.calls.length
    act(() => result.current.undo())
    expect(mocks.dispatch).toHaveBeenCalledTimes(dispatched)
    act(() => result.current.dismiss())
    expect(result.current.appliedName).toBeNull()
  })

  it('标签台：撤回写回标签与角色位，⛔ 不走 SET_PROMPT（会清掉画风与画师串）', () => {
    mocks.dialect = 'tags'
    const { result } = renderHook(() => useStudioTemplateApply([]))
    act(() => result.current.apply(RECIPE))
    expect(mocks.applyTagTemplate).toHaveBeenCalledWith(RECIPE)

    act(() => result.current.undo())
    const actions = mocks.dispatch.mock.calls.map(([action]) => action)
    expect(actions.map((action) => action.type)).not.toContain('SET_PROMPT')
    expect(actions).toContainEqual({
      type: 'SET_TAG_CHIPS',
      payload: { polarity: 'positive', chips: [{ text: '1girl', weight: 1 }] },
    })
    expect(actions).toContainEqual({
      type: 'SET_TAG_CHIPS',
      payload: { polarity: 'negative', chips: [{ text: 'lowres', weight: 1 }] },
    })
    expect(actions).toContainEqual({
      type: 'SET_ACTIVE_TAG_CHARACTER',
      payload: 0,
    })
  })

  it('没套过时撤销什么都不做；收起提示后也不能再撤', () => {
    const { result } = renderHook(() => useStudioTemplateApply([]))
    act(() => result.current.undo())
    expect(mocks.dispatch).not.toHaveBeenCalled()
    act(() => result.current.apply(RECIPE))
    act(() => result.current.dismiss())
    act(() => result.current.undo())
    expect(mocks.dispatch).not.toHaveBeenCalled()
  })

  /**
   * 提示词页「使用 → 用在标签台」带 `?template=` 过来（pages/prompts.md）：取回来照这一台
   * 的套用走（带撤销），装一次就拿掉参数；方言还没切到标签台时先不套。
   */
  it('标签台带 ?template=：取回来套上、出撤销条，参数拿掉', async () => {
    mocks.dialect = 'tags'
    mocks.search = 'template=r9&x=1'
    const recipe = { ...RECIPE, id: 'r9', name: '雨夜 · 撑伞' }
    mocks.getRecipe.mockResolvedValue({ success: true, data: recipe })

    const { result } = renderHook(() => useStudioTemplateApply([]))

    await waitFor(() =>
      expect(mocks.applyTagTemplate).toHaveBeenCalledWith(recipe),
    )
    expect(mocks.getRecipe).toHaveBeenCalledWith('r9')
    expect(mocks.replace).toHaveBeenCalledWith('/studio/image/tags?x=1', {
      scroll: false,
    })
    expect(result.current.appliedName).toBe('雨夜 · 撑伞')
  })

  it('自然语言台不接 ?template=；取不回来就说一句', async () => {
    mocks.search = 'template=r9'
    const { rerender } = renderHook(() => useStudioTemplateApply([]))
    expect(mocks.getRecipe).not.toHaveBeenCalled()

    mocks.dialect = 'tags'
    mocks.getRecipe.mockResolvedValue({ success: false, error: 'Not found' })
    rerender()
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith('loadFailed'),
    )
    expect(mocks.applyTagTemplate).not.toHaveBeenCalled()
  })
})
