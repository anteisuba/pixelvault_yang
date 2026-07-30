import { describe, expect, it } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import { GenerateImageServiceError } from '@/services/image/generate-image.service'
import { validateVideoGenerationInput } from '@/services/video-generation-validation.service'

describe('video-generation-validation.service', () => {
  it('accepts default product-supported options for built-in video models', () => {
    expect(() =>
      validateVideoGenerationInput({
        modelId: AI_MODELS.SEEDANCE_20,
        aspectRatio: '16:9',
        duration: 5,
        resolution: '720p',
      }),
    ).not.toThrow()
  })

  it('rejects durations outside the current product-supported set', () => {
    expect(() =>
      validateVideoGenerationInput({
        modelId: AI_MODELS.LTX_23,
        aspectRatio: '16:9',
        duration: 4,
        resolution: '720p',
      }),
    ).toThrowError(GenerateImageServiceError)
  })

  it('requires a visual reference for Seedance Reference', () => {
    expect(() =>
      validateVideoGenerationInput({
        modelId: AI_MODELS.SEEDANCE_20_REFERENCE,
        aspectRatio: '1:1',
        duration: 5,
      }),
    ).toThrowError(GenerateImageServiceError)
  })

  it('accepts a video-only Seedance Reference request', () => {
    expect(() =>
      validateVideoGenerationInput({
        modelId: AI_MODELS.SEEDANCE_20_REFERENCE,
        aspectRatio: '1:1',
        duration: 5,
        videoUrls: ['https://cdn.example.com/reference.mp4'],
      }),
    ).not.toThrow()
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

  describe('reference image cap (capability layer)', () => {
    it('accepts 3 references for Veo 3.1', () => {
      expect(() =>
        validateVideoGenerationInput({
          modelId: AI_MODELS.VEO_31,
          aspectRatio: '16:9',
          duration: 6,
          referenceImages: ['a', 'b', 'c'],
        }),
      ).not.toThrow()
    })

    it('rejects 4 references for Veo 3.1 with REFERENCE_IMAGE_LIMIT_EXCEEDED', () => {
      try {
        validateVideoGenerationInput({
          modelId: AI_MODELS.VEO_31,
          aspectRatio: '16:9',
          duration: 6,
          referenceImages: ['a', 'b', 'c', 'd'],
        })
        throw new Error('expected validation to throw')
      } catch (err) {
        expect(err).toBeInstanceOf(GenerateImageServiceError)
        expect((err as GenerateImageServiceError).code).toBe(
          'REFERENCE_IMAGE_LIMIT_EXCEEDED',
        )
      }
    })

    it('accepts one explicit first frame for Kling V3 Pro', () => {
      expect(() =>
        validateVideoGenerationInput({
          modelId: AI_MODELS.KLING_V3_PRO,
          aspectRatio: '16:9',
          duration: 5,
          referenceImages: ['a'],
        }),
      ).not.toThrow()
    })

    it('rejects flat extra Kling images until element slots are explicitly grouped', () => {
      try {
        validateVideoGenerationInput({
          modelId: AI_MODELS.KLING_V3_PRO,
          aspectRatio: '16:9',
          duration: 5,
          referenceImages: ['a', 'b'],
        })
        throw new Error('expected validation to throw')
      } catch (err) {
        expect(err).toBeInstanceOf(GenerateImageServiceError)
        expect((err as GenerateImageServiceError).code).toBe(
          'REFERENCE_IMAGE_LIMIT_EXCEEDED',
        )
      }
    })

    it('treats a singular referenceImage as count=1 for cap checks', () => {
      expect(() =>
        validateVideoGenerationInput({
          modelId: AI_MODELS.KLING_V3_PRO,
          aspectRatio: '16:9',
          duration: 5,
          referenceImage: 'a',
        }),
      ).not.toThrow()
    })
  })
})
