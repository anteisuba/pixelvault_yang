import { describe, it, expect } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { AI_MODELS } from '@/constants/models'
import {
  ADAPTER_CAPABILITIES,
  getCapabilityConfig,
  getMaxReferenceImages,
  hasCapability,
} from '@/constants/provider-capabilities'

describe('provider-capabilities', () => {
  it('every AI_ADAPTER_TYPES entry has a capabilities config', () => {
    for (const adapterType of Object.values(AI_ADAPTER_TYPES)) {
      const config = ADAPTER_CAPABILITIES[adapterType]
      expect(
        config,
        `Missing capabilities config for ${adapterType}`,
      ).toBeDefined()
      expect(Array.isArray(config.capabilities)).toBe(true)
    }
  })

  it('getCapabilityConfig returns correct config for known adapter', () => {
    const config = getCapabilityConfig(AI_ADAPTER_TYPES.OPENAI)
    expect(config.capabilities).toContain('quality')
    expect(config.capabilities).toContain('background')
    expect(config.capabilities).toContain('style')
    expect(config.qualityOptions).toBeDefined()
  })

  it('hasCapability returns true for supported capabilities', () => {
    expect(hasCapability(AI_ADAPTER_TYPES.NOVELAI, 'negativePrompt')).toBe(true)
    expect(hasCapability(AI_ADAPTER_TYPES.NOVELAI, 'guidanceScale')).toBe(true)
    expect(hasCapability(AI_ADAPTER_TYPES.NOVELAI, 'steps')).toBe(true)
    expect(hasCapability(AI_ADAPTER_TYPES.NOVELAI, 'seed')).toBe(true)
    expect(hasCapability(AI_ADAPTER_TYPES.NOVELAI, 'referenceStrength')).toBe(
      true,
    )
  })

  it('hasCapability returns false for unsupported capabilities', () => {
    // Gemini has no capabilities
    expect(hasCapability(AI_ADAPTER_TYPES.GEMINI, 'negativePrompt')).toBe(false)
    expect(hasCapability(AI_ADAPTER_TYPES.GEMINI, 'guidanceScale')).toBe(false)
    // OpenAI doesn't support diffusion-specific params
    expect(hasCapability(AI_ADAPTER_TYPES.OPENAI, 'negativePrompt')).toBe(false)
    expect(hasCapability(AI_ADAPTER_TYPES.OPENAI, 'guidanceScale')).toBe(false)
    expect(hasCapability(AI_ADAPTER_TYPES.OPENAI, 'seed')).toBe(false)
  })

  it('numeric range configs have valid min < max and positive step', () => {
    for (const [adapterType, config] of Object.entries(ADAPTER_CAPABILITIES)) {
      for (const rangeName of [
        'guidanceScale',
        'steps',
        'referenceStrength',
      ] as const) {
        const range = config[rangeName]
        if (range) {
          expect(
            range.min,
            `${adapterType}.${rangeName}.min should be < max`,
          ).toBeLessThan(range.max)
          expect(
            range.step,
            `${adapterType}.${rangeName}.step should be > 0`,
          ).toBeGreaterThan(0)
          expect(
            range.default,
            `${adapterType}.${rangeName}.default should be >= min`,
          ).toBeGreaterThanOrEqual(range.min)
          expect(
            range.default,
            `${adapterType}.${rangeName}.default should be <= max`,
          ).toBeLessThanOrEqual(range.max)
        }
      }
    }
  })

  it('OpenAI option arrays are non-empty when declared', () => {
    const config = getCapabilityConfig(AI_ADAPTER_TYPES.OPENAI)
    expect(config.qualityOptions!.length).toBeGreaterThan(0)
    expect(config.backgroundOptions!.length).toBeGreaterThan(0)
    expect(config.styleOptions!.length).toBeGreaterThan(0)
  })

  // B9 (D6): FLUX LoRA reference-image img2img is enabled — the workbench
  // gates the reference chip on getMaxReferenceImages > 0, and the strength
  // slider on the inherited FAL referenceStrength range.
  it('FLUX LoRA accepts one reference image with an inherited strength range', () => {
    expect(
      getMaxReferenceImages(AI_ADAPTER_TYPES.FAL, AI_MODELS.FLUX_LORA),
    ).toBe(1)
    const config = getCapabilityConfig(
      AI_ADAPTER_TYPES.FAL,
      AI_MODELS.FLUX_LORA,
    )
    expect(config.referenceStrength).toBeDefined()
    expect(config.capabilities).toContain('referenceStrength')
  })
})
