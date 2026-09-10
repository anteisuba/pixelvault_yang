import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'

vi.mock('@/constants/models', async () => ({
  AI_MODELS: (await import('@/constants/models/enum')).AI_MODELS,
  getAvailableImageModels: vi.fn(() => [
    {
      id: 'runner-only-model',
      adapterType: AI_ADAPTER_TYPES.RUNNER,
      providerConfig: { label: 'PixelVault Runner', baseUrl: '' },
      cost: 3,
      freeTier: false,
    },
    {
      id: 'studio-image-model',
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      providerConfig: { label: 'OpenAI', baseUrl: '' },
      cost: 1,
      freeTier: false,
    },
  ]),
}))

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

import { useStudioForm } from '@/contexts/studio-context'
import { findSelectedModel } from '@/lib/model-options'
import { useImageModelOptions } from '@/hooks/use-image-model-options'

describe('useImageModelOptions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('resets unsupported 2.5 quality when switching back to GPT Image 2', () => {
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
      payload: { resolution: '2K', quality: 'auto', seed: 42 },
    })
  })

  it('excludes LoRA-only Runner checkpoints from Image Studio', () => {
    const { result } = renderHook(() => useImageModelOptions())

    expect(result.current.modelOptions).toHaveLength(1)
    expect(result.current.modelOptions[0]?.modelId).toBe('studio-image-model')
    expect(result.current.modelOptions[0]?.adapterType).toBe(
      AI_ADAPTER_TYPES.OPENAI,
    )
  })
})
