import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { RecipeRecord } from '@/types'

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  promptDialect: 'tags' as 'tags' | 'natural',
}))

vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: () => ({
    state: {
      promptDialect: mocks.promptDialect,
      outputType: 'image',
      aspectRatio: '1:1',
      advancedParams: { seed: 1 },
      prompt: 'my artist, 1girl, solo',
      tagChips: [
        { text: '1girl', weight: 1 },
        { text: 'solo', weight: 1 },
      ],
    },
    dispatch: mocks.dispatch,
  }),
}))

import { useStudioPromptTemplates } from './use-studio-prompt-templates'

function tagRecipe(): RecipeRecord {
  return {
    id: 'recipe-1',
    userId: 'user-1',
    outputType: 'IMAGE',
    name: 'Two girls',
    compiledPrompt: '2girls, side-by-side',
    negativePrompt: null,
    modelId: 'nai-diffusion-4-5-full',
    provider: 'NovelAI',
    params: {
      promptDialect: 'tags',
      aspectRatio: '3:4',
      advancedParams: {
        negativePrompt: 'lowres, watermark',
        novelAiLayout: {
          positioning: 'auto',
          characters: [
            {
              prompt: 'red eyes',
              negativePrompt: '',
              position: { x: 0.3, y: 0.5 },
            },
          ],
        },
      },
    },
    parentGenerationId: null,
    version: 1,
    isDeleted: false,
    createdAt: '2026-09-26T00:00:00.000Z',
    updatedAt: '2026-09-26T00:00:00.000Z',
  }
}

describe('标签模板', () => {
  beforeEach(() => {
    mocks.dispatch.mockClear()
    mocks.promptDialect = 'tags'
  })

  it('存的是整体标签本身，⛔ 不含编译进来的画风与画师串', () => {
    const { result } = renderHook(() => useStudioPromptTemplates([]))
    expect(result.current.currentTemplatePrompt).toBe('1girl, solo')
    expect(result.current.currentTemplateParams).toMatchObject({
      promptDialect: 'tags',
    })
  })

  it('自然语言台存的模板不带标签标记', () => {
    mocks.promptDialect = 'natural'
    const { result } = renderHook(() => useStudioPromptTemplates([]))
    expect(result.current.currentTemplatePrompt).toBe('my artist, 1girl, solo')
    expect(result.current.currentTemplateParams).not.toHaveProperty(
      'promptDialect',
    )
  })

  it('套用 = 整组替换：整体 · 角色 · UC · 比例一起换，⛔ 不清画风与画师串', () => {
    const { result } = renderHook(() => useStudioPromptTemplates([]))
    result.current.handleApplyTagTemplate(tagRecipe())

    const actions = mocks.dispatch.mock.calls.map(([action]) => action)
    // `SET_PROMPT` 会清掉提示词块 —— 标签模板不能走它。
    expect(actions.map((action) => action.type)).not.toContain('SET_PROMPT')
    expect(actions).toContainEqual({ type: 'SET_ASPECT_RATIO', payload: '3:4' })
    expect(actions).toContainEqual(
      expect.objectContaining({
        type: 'SET_ADVANCED_PARAMS',
        payload: expect.objectContaining({
          novelAiLayout: expect.objectContaining({
            characters: [expect.objectContaining({ prompt: 'red eyes' })],
          }),
        }),
      }),
    )
    expect(actions).toContainEqual({
      type: 'SET_TAG_CHIPS',
      payload: {
        polarity: 'positive',
        chips: [
          { text: '2girls', weight: 1 },
          { text: 'side-by-side', weight: 1 },
        ],
      },
    })
    expect(actions).toContainEqual({
      type: 'SET_TAG_CHIPS',
      payload: {
        polarity: 'negative',
        chips: [
          { text: 'lowres', weight: 1 },
          { text: 'watermark', weight: 1 },
        ],
      },
    })
    expect(actions).toContainEqual({
      type: 'SET_ACTIVE_TAG_CHARACTER',
      payload: null,
    })
  })
})
