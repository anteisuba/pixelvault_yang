import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'

vi.mock('@/constants/models', () => ({
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
  useStudioForm: vi.fn(() => ({ state: { selectedOptionId: null } })),
}))

vi.mock('@/lib/model-options', () => ({
  buildSavedModelOptionsForModels: vi.fn(() => []),
  findSelectedModel: vi.fn(),
  mergeModelOptionsWithPreferredSavedRoutes: vi.fn(
    (_saved, builtIn) => builtIn,
  ),
  withProviderKeyCoverage: vi.fn((options) => options),
}))

import { useImageModelOptions } from '@/hooks/use-image-model-options'

describe('useImageModelOptions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('excludes LoRA-only Runner checkpoints from Image Studio', () => {
    const { result } = renderHook(() => useImageModelOptions())

    expect(result.current.modelOptions).toHaveLength(1)
    expect(result.current.modelOptions[0]?.modelId).toBe('studio-image-model')
    expect(result.current.modelOptions[0]?.adapterType).toBe(
      AI_ADAPTER_TYPES.OPENAI,
    )
  })
})
