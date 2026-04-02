import { describe, expect, it } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import {
  DEFAULT_VIDEO_MODEL_CAPABILITIES,
  VIDEO_MODEL_CAPABILITIES,
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
