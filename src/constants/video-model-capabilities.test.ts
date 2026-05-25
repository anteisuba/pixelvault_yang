import { describe, expect, it } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import {
  DEFAULT_VIDEO_MODEL_CAPABILITIES,
  VIDEO_MODEL_CAPABILITIES,
  getVideoAudioCapability,
  getVideoModelCapabilities,
} from '@/constants/video-model-capabilities'

describe('video-model-capabilities', () => {
  it('provides default capabilities for built-in video models', () => {
    const capabilities = getVideoModelCapabilities(AI_MODELS.WAN_VIDEO)

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
    const capabilities = getVideoModelCapabilities(AI_MODELS.RUNWAY_GEN3)

    expect(capabilities.requiresReferenceImage).toBe(true)
    expect(capabilities.supportedDurations).toEqual(
      DEFAULT_VIDEO_MODEL_CAPABILITIES.supportedDurations,
    )
  })

  it('only declares overrides for built-in video models', () => {
    for (const modelId of Object.keys(VIDEO_MODEL_CAPABILITIES)) {
      const capabilities = getVideoModelCapabilities(modelId)

      expect(capabilities.supportedDurations?.length ?? 0).toBeGreaterThan(0)
      expect(capabilities.supportedResolutions?.length ?? 0).toBeGreaterThan(0)
    }
  })
})

describe('getVideoAudioCapability', () => {
  it('returns none for models without an audio declaration', () => {
    expect(getVideoAudioCapability(AI_MODELS.SEEDANCE_20).mode).toBe('none')
    expect(getVideoAudioCapability(AI_MODELS.SEEDANCE_20_FAST).mode).toBe(
      'none',
    )
    expect(getVideoAudioCapability(AI_MODELS.RUNWAY_GEN3).mode).toBe('none')
  })

  it('returns native for Veo 3.1', () => {
    expect(getVideoAudioCapability(AI_MODELS.VEO_31).mode).toBe('native')
  })

  it('returns lipsync with needsScript for Kling models', () => {
    const v3 = getVideoAudioCapability(AI_MODELS.KLING_V3_PRO)
    expect(v3.mode).toBe('lipsync')
    expect(v3.needsScript).toBe(true)

    const v21 = getVideoAudioCapability(AI_MODELS.KLING_VIDEO)
    expect(v21.mode).toBe('lipsync')
    expect(v21.needsScript).toBe(true)
  })

  it('falls back to none for unknown / undefined model ids', () => {
    expect(getVideoAudioCapability(undefined).mode).toBe('none')
    expect(getVideoAudioCapability('unknown-model').mode).toBe('none')
  })
})
