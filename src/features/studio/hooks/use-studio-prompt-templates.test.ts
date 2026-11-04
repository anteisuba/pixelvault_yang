// @vitest-environment jsdom
import { act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { RecipeRecord } from '@/types'
import {
  fakeStudioServer,
  renderHookWithStudio,
  type StudioHandle,
} from '@/test/studio-harness'
import { useStudioPromptTemplates } from './use-studio-prompt-templates'

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-a' }),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/image/tags',
  useRouter: () => ({ push: vi.fn() }),
}))

const NAI_OPTION = 'workspace:nai-diffusion-4-5-full'

/**
 * 摆一张真工作台：整体标签 `1girl, solo`，但提示词里多编进了一段画师串
 * （自然语言台写的，再切回标签台），UC `lowres`，比例 1:1，种子 1。
 */
function seedBench(studio: StudioHandle, dialect: 'tags' | 'natural') {
  act(() => {
    studio.dispatch({ type: 'SET_OPTION_ID', payload: NAI_OPTION })
    studio.dispatch({ type: 'SET_PROMPT_DIALECT', payload: 'tags' })
    studio.dispatch({
      type: 'SET_TAG_CHIPS',
      payload: {
        polarity: 'positive',
        chips: [
          { text: '1girl', weight: 1 },
          { text: 'solo', weight: 1 },
        ],
      },
    })
    studio.dispatch({ type: 'SET_PROMPT_DIALECT', payload: 'natural' })
    studio.dispatch({ type: 'SET_PROMPT', payload: 'my artist, 1girl, solo' })
    studio.dispatch({ type: 'SET_ADVANCED_PARAMS', payload: { seed: 1 } })
    studio.dispatch({ type: 'SET_PROMPT_DIALECT', payload: dialect })
  })
}

function renderTemplates(dialect: 'tags' | 'natural' = 'tags') {
  const view = renderHookWithStudio(() => useStudioPromptTemplates([]))
  seedBench(view.result.current.studio, dialect)
  return view
}

beforeEach(() => {
  fakeStudioServer()
})
afterEach(() => vi.unstubAllGlobals())

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
  it('存的是整体标签本身，⛔ 不含编译进来的画风与画师串', () => {
    const { result } = renderTemplates('tags')
    expect(result.current.studio.state.prompt).toBe('my artist, 1girl, solo')
    expect(result.current.value.currentTemplatePrompt).toBe('1girl, solo')
    expect(result.current.value.currentTemplateParams).toMatchObject({
      promptDialect: 'tags',
    })
  })

  it('自然语言台存的模板不带标签标记', () => {
    const { result } = renderTemplates('natural')
    expect(result.current.value.currentTemplatePrompt).toBe(
      'my artist, 1girl, solo',
    )
    expect(result.current.value.currentTemplateParams).not.toHaveProperty(
      'promptDialect',
    )
  })

  it('套用 = 整组替换：整体 · 角色 · UC · 比例一起换，⛔ 不清画风与画师串', () => {
    const { result } = renderTemplates('tags')
    act(() => {
      result.current.studio.dispatch({
        type: 'SET_ACTIVE_TAG_CHARACTER',
        payload: 0,
      })
      result.current.value.handleApplyTagTemplate(tagRecipe())
    })

    const state = result.current.studio.state
    expect(state.aspectRatio).toBe('3:4')
    expect(state.advancedParams.novelAiLayout?.characters).toEqual([
      expect.objectContaining({ prompt: 'red eyes' }),
    ])
    expect(state.tagChips).toEqual([
      { text: '2girls', weight: 1 },
      { text: 'side-by-side', weight: 1 },
    ])
    expect(state.prompt).toBe('2girls, side-by-side')
    expect(state.tagNegativeChips).toEqual([
      { text: 'lowres', weight: 1 },
      { text: 'watermark', weight: 1 },
    ])
    expect(state.advancedParams.negativePrompt).toBe('lowres, watermark')
    expect(state.activeTagCharacterIndex).toBeNull()
    expect(state.recipeUsage).toMatchObject({ recipeId: 'recipe-1' })
  })

  /**
   * 标签台也列 LoRA 模板（owner 2026-09-26）：它的模型是挂 LoRA 的底模，NAI 跑不了
   * LoRA —— 套用只换正向 / UC 标签，⛔ 不换模型 / 规格 / 专属参数。
   */
  it('LoRA 模板在标签台只换标签，⛔ 不换模型与参数', () => {
    const { result } = renderTemplates('tags')
    act(() => {
      result.current.value.handleApplyTagTemplate({
        ...tagRecipe(),
        modelId: 'illustrious-xl',
        compiledPrompt: 'masterpiece, 1girl',
        params: {
          aspectRatio: '16:9',
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
    })

    const state = result.current.studio.state
    expect(state.selectedOptionId).toBe(NAI_OPTION)
    expect(state.aspectRatio).toBe('1:1')
    expect(state.advancedParams.seed).toBe(1)
    expect(state.advancedParams.loras).toBeUndefined()
    expect(state.tagChips).toEqual([
      { text: 'masterpiece', weight: 1 },
      { text: '1girl', weight: 1 },
    ])
    expect(state.tagNegativeChips).toEqual([{ text: 'bad hands', weight: 1 }])
  })

  /**
   * 提示词页新建的（pages/prompts.md「新建」）：只有标签与负面，负面在那一列 ——
   * 套用同样只换这两样，⛔ 按占格的型号去换模型。
   */
  it('提示词页新建的在标签台只换标签和负面（负面读那一列），⛔ 不换模型与参数', () => {
    const { result } = renderTemplates('tags')
    act(() => {
      result.current.value.handleApplyTagTemplate({
        ...tagRecipe(),
        modelId: 'novelai-v5-full',
        compiledPrompt: 'no humans, scenery',
        negativePrompt: 'text, signature',
        params: { promptDialect: 'tags', origin: 'prompts' },
      })
    })

    const state = result.current.studio.state
    expect(state.selectedOptionId).toBe(NAI_OPTION)
    expect(state.advancedParams.seed).toBe(1)
    expect(state.tagChips).toEqual([
      { text: 'no humans', weight: 1 },
      { text: 'scenery', weight: 1 },
    ])
    expect(state.tagNegativeChips).toEqual([
      { text: 'text', weight: 1 },
      { text: 'signature', weight: 1 },
    ])
  })
})
