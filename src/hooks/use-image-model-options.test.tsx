import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'

vi.mock('@/hooks/use-my-profile', () => ({
  useMyProfile: vi.fn(() => ({ profile: null })),
}))

vi.mock('@/constants/models', async () => {
  const { IMAGE_KIND } = await import('@/constants/models/image')
  const models = [
    {
      id: 'qwen-image-2.1-runner',
      adapterType: AI_ADAPTER_TYPES.RUNNER,
      providerConfig: { label: 'PixelVault Runner', baseUrl: '' },
      cost: 3,
    },
    {
      id: 'runner-only-model',
      adapterType: AI_ADAPTER_TYPES.RUNNER,
      providerConfig: { label: 'PixelVault Runner', baseUrl: '' },
      cost: 3,
      imageKind: IMAGE_KIND.LORA_BASE,
    },
    {
      id: 'studio-image-model',
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      providerConfig: { label: 'OpenAI', baseUrl: '' },
      cost: 1,
    },
  ]
  return {
    AI_MODELS: (await import('@/constants/models/enum')).AI_MODELS,
    IMAGE_KIND,
    getAvailableImageModels: vi.fn((kind?: string) =>
      models.filter(
        (model) =>
          kind === undefined ||
          (model.imageKind ?? IMAGE_KIND.GENERATE) === kind,
      ),
    ),
  }
})

vi.mock('@/contexts/api-keys-context', () => ({
  useApiKeysContext: vi.fn(() => ({ keys: [], healthMap: {} })),
}))

vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: vi.fn(() => ({
    state: { selectedOptionId: null, outputType: 'image' },
    dispatch: vi.fn(),
  })),
}))

// 默认模型自动补位只在 `/studio/image` 路由上开火；这个用例只关心目录过滤。
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/zh/studio/video'),
}))

vi.mock('@/lib/model-options', () => ({
  buildSavedModelOptionsForModels: vi.fn(() => []),
  findSelectedModel: vi.fn(),
  mergeModelOptionsWithPreferredSavedRoutes: vi.fn(
    (_saved, builtIn) => builtIn,
  ),
  withProviderKeyCoverage: vi.fn((options) => options),
}))

import {
  AI_MODELS,
  getAvailableImageModels,
  IMAGE_KIND,
} from '@/constants/models'
import { useStudioForm } from '@/contexts/studio-context'
import { findSelectedModel } from '@/lib/model-options'
import { useMyProfile } from '@/hooks/use-my-profile'
import { useImageModelOptions } from '@/hooks/use-image-model-options'

describe('useImageModelOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useMyProfile).mockReturnValue({ profile: null } as ReturnType<
      typeof useMyProfile
    >)
    vi.mocked(findSelectedModel).mockReset()
    vi.mocked(useStudioForm).mockReturnValue({
      state: { selectedOptionId: null, outputType: 'image' },
      dispatch: vi.fn(),
    } as unknown as ReturnType<typeof useStudioForm>)
  })

  // 切模型 = 直接切（批注 36）：新模型不认识的**专属**值整个删掉（删 = 回默认），
  // 通用值（规格 / seed）一个都不动。⛔ 不写「上一个模型的快照」。
  it('drops unsupported 2.5 quality when switching back to GPT Image 2', () => {
    const dispatch = vi.fn()
    vi.mocked(useStudioForm).mockReturnValueOnce({
      state: {
        selectedOptionId: 'workspace:gpt-image-2',
        outputType: 'image',
        advancedParams: { resolution: '2K', quality: 'max', seed: 42 },
      },
      dispatch,
    } as unknown as ReturnType<typeof useStudioForm>)
    vi.mocked(findSelectedModel).mockReturnValueOnce({
      optionId: 'workspace:gpt-image-2',
      modelId: 'gpt-image-2',
      adapterType: AI_ADAPTER_TYPES.OPENAI,
    } as ReturnType<typeof findSelectedModel>)
    renderHook(() => useImageModelOptions())
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_ADVANCED_PARAMS',
      payload: { resolution: '2K', seed: 42 },
    })
  })

  it('lists only generation entries, keeping LoRA bases out of Image Studio', () => {
    const { result } = renderHook(() => useImageModelOptions())

    expect(getAvailableImageModels).toHaveBeenCalledWith(IMAGE_KIND.GENERATE)
    expect(result.current.modelOptions).toHaveLength(1)
    expect(result.current.modelOptions[0]?.modelId).toBe('studio-image-model')
    expect(result.current.modelOptions[0]?.adapterType).toBe(
      AI_ADAPTER_TYPES.OPENAI,
    )
  })

  it('shows Qwen only after the server grants evaluation access', () => {
    const { result, rerender } = renderHook(() => useImageModelOptions())
    expect(
      result.current.modelOptions.some(
        (model) => model.modelId === AI_MODELS.QWEN_IMAGE_21_RUNNER,
      ),
    ).toBe(false)
    vi.mocked(useMyProfile).mockReturnValue({
      profile: { qwenEvaluationAllowed: true },
    } as ReturnType<typeof useMyProfile>)
    rerender()
    expect(
      result.current.modelOptions.some(
        (model) => model.modelId === AI_MODELS.QWEN_IMAGE_21_RUNNER,
      ),
    ).toBe(true)
  })

  it.each([false, true])(
    'retains both providers after editing with PixAI primary=%s, then prunes on deselection',
    (pixaiPrimary) => {
      const models = [
        {
          id: AI_MODELS.NOVELAI_V5_CURATED,
          adapterType: AI_ADAPTER_TYPES.NOVELAI,
        },
        { id: AI_MODELS.PIXAI_TSUBAKI_2, adapterType: AI_ADAPTER_TYPES.PIXAI },
      ]
      vi.mocked(getAvailableImageModels).mockReturnValueOnce(
        models as ReturnType<typeof getAvailableImageModels>,
      )
      const primary = models[pixaiPrimary ? 1 : 0]
      const extra = models[pixaiPrimary ? 0 : 1]
      const selectedModel = {
        optionId: `workspace:${primary.id}`,
        modelId: primary.id,
        adapterType: primary.adapterType,
      } as NonNullable<ReturnType<typeof findSelectedModel>>
      vi.mocked(findSelectedModel).mockReturnValue(selectedModel)
      const state = {
        selectedOptionId: selectedModel.optionId,
        extraModelOptionIds: [`workspace:${extra.id}`],
        outputType: 'image',
        promptDialect: 'tags',
        advancedParams: {
          qualityToggle: 'standard',
          pixaiMode: 'ultra',
          seed: 42,
        },
      }
      const dispatch = vi.fn()
      vi.mocked(useStudioForm).mockReturnValue({
        state,
        dispatch,
      } as unknown as ReturnType<typeof useStudioForm>)
      const { rerender } = renderHook(() => useImageModelOptions())
      expect(dispatch).not.toHaveBeenCalled()

      state.advancedParams = {
        qualityToggle: 'light',
        pixaiMode: 'lite',
        seed: 42,
      }
      rerender()
      expect(dispatch).not.toHaveBeenCalled()

      state.extraModelOptionIds = []
      rerender()
      expect(dispatch).toHaveBeenLastCalledWith({
        type: 'SET_ADVANCED_PARAMS',
        payload: pixaiPrimary
          ? { pixaiMode: 'lite', seed: 42 }
          : { qualityToggle: 'light', seed: 42 },
      })
    },
  )
})
