// @vitest-environment jsdom
import { act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import type { RecipeRecord } from '@/types'
import type { StudioModelOption } from '@/types/model-option'
import { message } from '@/test/app-harness'
import {
  fakeStudioServer,
  renderHookWithStudio,
  settle,
  type StudioHandle,
} from '@/test/studio-harness'
import { useStudioTemplateApply } from './use-studio-template-apply'

const mocks = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
}))

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-a' }),
}))
vi.mock('sonner', () => ({ toast: mocks.toast }))

const GPT_OPTION: StudioModelOption = {
  optionId: 'key:gpt',
  modelId: 'gpt-image-2',
  adapterType: AI_ADAPTER_TYPES.OPENAI,
  providerConfig: { label: 'OpenAI', baseUrl: 'https://example.com' },
  requestCount: 1,
  isBuiltIn: true,
  sourceType: 'saved',
  keyId: 'gpt',
}
const NAI_OPTION: StudioModelOption = {
  optionId: 'key:nai',
  modelId: 'nai-diffusion-4-5-full',
  adapterType: AI_ADAPTER_TYPES.NOVELAI,
  providerConfig: { label: 'NovelAI', baseUrl: 'https://example.com' },
  requestCount: 1,
  isBuiltIn: true,
  sourceType: 'saved',
  keyId: 'nai',
}
/** 这家没配 key（key 名单已回来、空的）。 */
const MISSING_KEY_OPTION: StudioModelOption = {
  ...GPT_OPTION,
  optionId: 'workspace:gpt-image-2',
  sourceType: 'workspace',
  keyId: undefined,
}

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

function renderApply(
  dialect: 'natural' | 'tags' = 'natural',
  options: StudioModelOption[] = [GPT_OPTION],
) {
  const view = renderHookWithStudio(() => useStudioTemplateApply(options))
  seed(view.result.current.studio, dialect)
  return view
}

describe('模板套用 + 撤销', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fakeStudioServer()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('自然语言台：套上之后能按快照原样撤回', () => {
    const { result } = renderApply('natural')
    const before = result.current.studio.state
    act(() => result.current.value.apply(RECIPE))
    const applied = result.current.studio.state
    expect(applied.prompt).toBe('rainy night portrait')
    expect(applied.selectedOptionId).toBe('key:gpt')
    expect(applied.advancedParams).toEqual({ seed: 42 })
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

  it('⭐ 存着 NAI 型号的图片模板（没打标签标记）在标签台：型号 · 负面 · 比例 · 种子整份换上', async () => {
    const { result } = renderApply('tags', [NAI_OPTION])
    await settle()
    act(() =>
      result.current.value.apply({
        ...RECIPE,
        id: 'nai-img',
        name: 'NAI 雨夜',
        modelId: 'nai-diffusion-4-5-full',
        compiledPrompt: '1girl, rain',
        negativePrompt: 'lowres, watermark',
        seed: '777',
        params: { aspectRatio: '3:4', advancedParams: { steps: 28 } },
      } as RecipeRecord),
    )
    const state = result.current.studio.state
    expect(state.selectedOptionId).toBe('key:nai')
    expect(state.aspectRatio).toBe('3:4')
    expect(state.advancedParams).toMatchObject({
      negativePrompt: 'lowres, watermark',
      steps: 28,
      seed: 777,
    })
    expect(state.tagChips.map((chip) => chip.text)).toEqual(['1girl', 'rain'])
    expect(state.tagNegativeChips.map((chip) => chip.text)).toEqual([
      'lowres',
      'watermark',
    ])
  })

  it('模板的型号退役了（不在名单里）：保持当前模型并说一句，其余照套', async () => {
    const { result } = renderApply('natural', [])
    await settle()
    act(() => result.current.value.apply(RECIPE))
    expect(result.current.studio.state.selectedOptionId).toBe(
      'workspace:seedream-5.0-lite',
    )
    expect(result.current.studio.state.prompt).toBe('rainy night portrait')
    expect(message('StudioV3.remixModelUnavailable')).toContain('{model}')
    expect(String(mocks.toast.mock.calls[0]?.[0])).toContain('已不可用')
  })

  it('模板的型号缺 key：先不选，就地弹配置；其余照套', async () => {
    // key 名单要回来了才算「确定缺」（`isMissingKeyModelOption`）；名单推迟到空闲才拉。
    const view = renderHookWithStudio(() => ({
      apply: useStudioTemplateApply([MISSING_KEY_OPTION]),
      keysLoaded: useApiKeysContext().hasLoaded,
    }))
    seed(view.result.current.studio, 'natural')
    await waitFor(() => expect(view.result.current.value.keysLoaded).toBe(true))
    const result = {
      get current() {
        return {
          studio: view.result.current.studio,
          value: view.result.current.value.apply,
        }
      },
    }
    act(() => result.current.value.apply(RECIPE))
    expect(result.current.studio.state.selectedOptionId).toBe(
      'workspace:seedream-5.0-lite',
    )
    expect(result.current.studio.state.prompt).toBe('rainy night portrait')
    expect(result.current.value.keySetupDialog).not.toBeNull()
  })
})
