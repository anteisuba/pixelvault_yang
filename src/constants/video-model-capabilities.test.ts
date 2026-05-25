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
  it('returns auto for models without a voice-cloning endpoint', () => {
    expect(getVideoAudioCapability(AI_MODELS.SEEDANCE_20).mode).toBe('auto')
    expect(getVideoAudioCapability(AI_MODELS.SEEDANCE_20_FAST).mode).toBe(
      'auto',
    )
    expect(getVideoAudioCapability(AI_MODELS.VEO_31).mode).toBe('auto')
    expect(getVideoAudioCapability(AI_MODELS.KLING_V3_PRO).mode).toBe('auto')
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
