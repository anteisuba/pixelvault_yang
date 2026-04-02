import { describe, expect, it } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import { GenerateImageServiceError } from '@/services/generate-image.service'
import { validateVideoGenerationInput } from '@/services/video-generation-validation.service'

describe('video-generation-validation.service', () => {
  it('accepts default product-supported options for built-in video models', () => {
    expect(() =>
      validateVideoGenerationInput({
        modelId: AI_MODELS.WAN_VIDEO,
        aspectRatio: '16:9',
        duration: 5,
        resolution: '720p',
      }),
    ).not.toThrow()
  })

  it('rejects durations outside the current product-supported set', () => {
    expect(() =>
      validateVideoGenerationInput({
        modelId: AI_MODELS.WAN_VIDEO,
        aspectRatio: '16:9',
        duration: 4,
        resolution: '720p',
      }),
    ).toThrowError(GenerateImageServiceError)
  })

  it('requires a reference image for image-to-video-only models', () => {
    expect(() =>
      validateVideoGenerationInput({
        modelId: AI_MODELS.RUNWAY_GEN3,
        aspectRatio: '16:9',
        duration: 5,
      }),
    ).toThrowError(GenerateImageServiceError)
  })

  it('rejects image models in the video pipeline', () => {
    expect(() =>
      validateVideoGenerationInput({
        modelId: AI_MODELS.GEMINI_FLASH_IMAGE,
        aspectRatio: '16:9',
        duration: 5,
      }),
    ).toThrowError(GenerateImageServiceError)
  })

  it('does not block custom/BYOK models without centralized metadata', () => {
    expect(() =>
      validateVideoGenerationInput({
        modelId: 'custom-video-model',
        aspectRatio: '16:9',
        duration: 4,
        resolution: '720p',
      }),
    ).not.toThrow()
  })
})
