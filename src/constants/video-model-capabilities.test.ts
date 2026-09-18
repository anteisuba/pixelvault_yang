import { describe, expect, it } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import {
  DEFAULT_VIDEO_MODEL_CAPABILITIES,
  VIDEO_MODEL_CAPABILITIES,
  getVideoAudioCapability,
  getVideoModelCapabilities,
  snapVideoDuration,
  snapVideoResolution,
  videoModelSupportsSeed,
} from '@/constants/video-model-capabilities'

describe('videoModelSupportsSeed', () => {
  it('supports seed for all Seedance variants (regardless of reference)', () => {
    for (const modelId of [
      AI_MODELS.SEEDANCE_20,
      AI_MODELS.SEEDANCE_20_FAST,
      AI_MODELS.SEEDANCE_20_REFERENCE,
      AI_MODELS.SEEDANCE_20_FAST_REFERENCE,
      AI_MODELS.SEEDANCE_20_VOLCENGINE,
      AI_MODELS.SEEDANCE_20_REFERENCE_VOLCENGINE,
    ]) {
      expect(videoModelSupportsSeed(modelId, false)).toBe(true)
      expect(videoModelSupportsSeed(modelId, true)).toBe(true)
    }
  })

  it('supports seed for Veo base (t2v) but NOT reference (i2v)', () => {
    expect(videoModelSupportsSeed(AI_MODELS.VEO_31, false)).toBe(true)
    expect(videoModelSupportsSeed(AI_MODELS.VEO_31, true)).toBe(false)
  })

  it('rejects seed for Kling and LTX', () => {
    expect(videoModelSupportsSeed(AI_MODELS.KLING_V3_PRO, false)).toBe(false)
    expect(videoModelSupportsSeed(AI_MODELS.LTX_23, false)).toBe(false)
  })
})

describe('video-model-capabilities', () => {
  it('provides default capabilities for custom video models', () => {
    const capabilities = getVideoModelCapabilities('custom-video-model')

    expect(capabilities.supportedDurations).toEqual(
      DEFAULT_VIDEO_MODEL_CAPABILITIES.supportedDurations,
    )
    expect(capabilities.supportedResolutions).toEqual(
      DEFAULT_VIDEO_MODEL_CAPABILITIES.supportedResolutions,
    )
    expect(capabilities.supportedAspectRatios).toEqual(
      DEFAULT_VIDEO_MODEL_CAPABILITIES.supportedAspectRatios,
    )
  })

  it('applies model-specific overrides on top of the defaults', () => {
    const capabilities = getVideoModelCapabilities(AI_MODELS.LTX_23)

    expect(capabilities.requiresReferenceImage).toBe(false)
    expect(capabilities.supportedDurations).toEqual([6, 8, 10])
    expect(capabilities.supportedResolutions).toEqual(['1080p'])
  })

  it('only declares overrides for built-in video models', () => {
    for (const modelId of Object.keys(VIDEO_MODEL_CAPABILITIES)) {
      const capabilities = getVideoModelCapabilities(modelId)

      expect(capabilities.supportedDurations?.length ?? 0).toBeGreaterThan(0)
      expect(capabilities.supportedResolutions?.length ?? 0).toBeGreaterThan(0)
    }
  })
})

describe('snapVideoDuration', () => {
  it('adsorbs leftover 3s onto Seedance 2.5 minimum 4s', () => {
    expect(snapVideoDuration(AI_MODELS.SEEDANCE_25, 3)).toBe(4)
    expect(snapVideoDuration(AI_MODELS.SEEDANCE_25_REFERENCE, 3)).toBe(4)
  })

  it('keeps a legal Seedance duration', () => {
    expect(snapVideoDuration(AI_MODELS.SEEDANCE_25, 8)).toBe(8)
  })
})

describe('snapVideoResolution', () => {
  it('passes a supported resolution through untouched', () => {
    expect(snapVideoResolution(AI_MODELS.SEEDANCE_25, '1080p')).toBe('1080p')
    expect(snapVideoResolution(AI_MODELS.SEEDANCE_25, '480p')).toBe('480p')
  })

  it('snaps downwards when the request sits between two offered steps', () => {
    // Seedance 2.5 offers 480p/720p/1080p — 540p is equidistant, 480p wins.
    expect(snapVideoResolution(AI_MODELS.SEEDANCE_25, '540p')).toBe('480p')
  })

  it('snaps to the nearest step the model actually offers', () => {
    // Seedance 2.0 Fast stops at 720p.
    expect(snapVideoResolution(AI_MODELS.SEEDANCE_20_FAST, '1080p')).toBe(
      '720p',
    )
    // MiniMax H3 is 2K-only; HappyHorse has no 480p.
    expect(snapVideoResolution(AI_MODELS.MINIMAX_H3, '720p')).toBe('2k')
    expect(snapVideoResolution(AI_MODELS.HAPPYHORSE_10, '480p')).toBe('720p')
  })
})

describe('getVideoAudioCapability', () => {
  it('returns auto for models without a voice-cloning endpoint', () => {
    expect(getVideoAudioCapability(AI_MODELS.SEEDANCE_20).mode).toBe('auto')
    expect(getVideoAudioCapability(AI_MODELS.SEEDANCE_20_FAST).mode).toBe(
      'auto',
    )
    expect(getVideoAudioCapability(AI_MODELS.VEO_31).mode).toBe('auto')
    expect(getVideoAudioCapability(AI_MODELS.KLING_V3_PRO).mode).toBe('auto')
    expect(getVideoAudioCapability(AI_MODELS.HAPPYHORSE_10).mode).toBe('auto')
    expect(getVideoAudioCapability(AI_MODELS.LTX_23).mode).toBe('auto')
  })

  it('returns reference + maxReferences for Seedance Reference endpoints', () => {
    const standard = getVideoAudioCapability(AI_MODELS.SEEDANCE_20_REFERENCE)
    expect(standard.mode).toBe('reference')
    expect(standard.maxReferences).toBe(3)

    const fast = getVideoAudioCapability(AI_MODELS.SEEDANCE_20_FAST_REFERENCE)
    expect(fast.mode).toBe('reference')
    expect(fast.maxReferences).toBe(3)
  })

  it('falls back to auto for unknown / undefined model ids', () => {
    expect(getVideoAudioCapability(undefined).mode).toBe('auto')
    expect(getVideoAudioCapability('unknown-model').mode).toBe('auto')
  })
})
