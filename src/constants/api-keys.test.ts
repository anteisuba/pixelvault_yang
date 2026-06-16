import { describe, expect, it } from 'vitest'

import {
  ACTIVE_API_KEY_ADAPTER_OPTIONS,
  API_KEY_ADAPTER_OPTIONS,
} from '@/constants/api-keys'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

describe('api key adapter options', () => {
  it('keeps schema compatibility while exposing only active product adapters', () => {
    expect(API_KEY_ADAPTER_OPTIONS).toContain(AI_ADAPTER_TYPES.RUNWAY)
    expect(API_KEY_ADAPTER_OPTIONS).toContain(AI_ADAPTER_TYPES.HUGGINGFACE)

    expect(ACTIVE_API_KEY_ADAPTER_OPTIONS).toEqual([
      AI_ADAPTER_TYPES.GEMINI,
      AI_ADAPTER_TYPES.OPENAI,
      AI_ADAPTER_TYPES.DEEPSEEK,
      AI_ADAPTER_TYPES.FAL,
      AI_ADAPTER_TYPES.REPLICATE,
      AI_ADAPTER_TYPES.NOVELAI,
      // VolcEngine (火山方舟) became active once the direct-API Seedance/Seedream
      // variants shipped as available models — users need to configure its key.
      AI_ADAPTER_TYPES.VOLCENGINE,
      AI_ADAPTER_TYPES.FISH_AUDIO,
      AI_ADAPTER_TYPES.HYPER3D_RODIN,
    ])

    expect(ACTIVE_API_KEY_ADAPTER_OPTIONS).not.toContain(
      AI_ADAPTER_TYPES.HUGGINGFACE,
    )
    expect(ACTIVE_API_KEY_ADAPTER_OPTIONS).not.toContain(
      AI_ADAPTER_TYPES.RUNWAY,
    )
  })
})
