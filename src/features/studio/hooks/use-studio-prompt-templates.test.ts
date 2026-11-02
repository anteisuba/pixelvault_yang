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

  /**
   * 标签台也列 LoRA 模板（owner 2026-09-26）：它的模型是挂 LoRA 的底模，NAI 跑不了
   * LoRA —— 套用只换正向 / UC 标签，⛔ 不换模型 / 规格 / 专属参数。
   */
  it('LoRA 模板在标签台只换标签，⛔ 不换模型与参数', () => {
    const { result } = renderHook(() => useStudioPromptTemplates([]))
    result.current.handleApplyTagTemplate({
      ...tagRecipe(),
      modelId: 'illustrious-xl',
      compiledPrompt: 'masterpiece, 1girl',
      params: {
        advancedParams: {
          negativePrompt: 'bad hands',
          loras: [
            {
              url: 'https://civitai.com/api/download/models/111',
              scale: 0.8,
            },
          ],
        },
      },
    })

    const types = mocks.dispatch.mock.calls.map(([action]) => action.type)
    for (const type of [
      'SET_OPTION_ID',
      'SET_ADVANCED_PARAMS',
      'SET_ASPECT_RATIO',
      'SET_PROMPT',
    ])
      expect(types).not.toContain(type)
    const actions = mocks.dispatch.mock.calls.map(([action]) => action)
    expect(actions).toContainEqual({
      type: 'SET_TAG_CHIPS',
      payload: {
        polarity: 'positive',
        chips: [
          { text: 'masterpiece', weight: 1 },
          { text: '1girl', weight: 1 },
        ],
      },
    })
    expect(actions).toContainEqual({
      type: 'SET_TAG_CHIPS',
      payload: {
        polarity: 'negative',
        chips: [{ text: 'bad hands', weight: 1 }],
      },
    })
  })

  /**
   * 提示词页新建的（pages/prompts.md「新建」）：只有标签与负面，负面在那一列 ——
   * 套用同样只换这两样，⛔ 按占格的型号去换模型。
   */
  it('提示词页新建的在标签台只换标签和负面（负面读那一列），⛔ 不换模型与参数', () => {
    const { result } = renderHook(() => useStudioPromptTemplates([]))
    result.current.handleApplyTagTemplate({
      ...tagRecipe(),
      modelId: 'novelai-v5-full',
      compiledPrompt: 'no humans, scenery',
      negativePrompt: 'text, signature',
      params: { promptDialect: 'tags', origin: 'prompts' },
    })

    const types = mocks.dispatch.mock.calls.map(([action]) => action.type)
    for (const type of ['SET_OPTION_ID', 'SET_ADVANCED_PARAMS'])
      expect(types).not.toContain(type)
    const actions = mocks.dispatch.mock.calls.map(([action]) => action)
    expect(actions).toContainEqual({
      type: 'SET_TAG_CHIPS',
      payload: {
        polarity: 'negative',
        chips: [
          { text: 'text', weight: 1 },
          { text: 'signature', weight: 1 },
        ],
      },
    })
  })
})
