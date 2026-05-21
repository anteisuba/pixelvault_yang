import { describe, expect, it } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  getImageReferenceCapability,
  getReferenceCapability,
  getReferenceCapabilityMax,
  getVideoReferenceCapability,
  isReferenceImageRequired,
} from '@/constants/reference-image-capabilities'

describe('reference-image-capabilities', () => {
  describe('getImageReferenceCapability', () => {
    it('returns kind:none when model is overridden to zero (FLUX_LORA)', () => {
      const cap = getImageReferenceCapability(
        AI_ADAPTER_TYPES.FAL,
        AI_MODELS.FLUX_LORA,
      )
      expect(cap.kind).toBe('none')
    })

    it('returns flexible max=14 for GEMINI adapter', () => {
      const cap = getImageReferenceCapability(AI_ADAPTER_TYPES.GEMINI)
      if (cap.kind !== 'flexible') throw new Error('expected flexible')
      expect(cap.min).toBe(0)
      expect(cap.max).toBe(14)
      expect(cap.defaultRole).toBe('general')
      expect(cap.mode).toBe('native')
    })

    it('honours per-model override for FLUX_KONTEXT_MAX (max=4, native mode)', () => {
      const cap = getImageReferenceCapability(
        AI_ADAPTER_TYPES.FAL,
        AI_MODELS.FLUX_KONTEXT_MAX,
      )
      if (cap.kind !== 'flexible') throw new Error('expected flexible')
      expect(cap.max).toBe(4)
      expect(cap.mode).toBe('native')
    })

    it('falls back to adapter default (max=1, img2img) when no model id', () => {
      const cap = getImageReferenceCapability(AI_ADAPTER_TYPES.FAL)
      if (cap.kind !== 'flexible') throw new Error('expected flexible')
      expect(cap.max).toBe(1)
      expect(cap.mode).toBe('img2img')
    })

    it('keeps adapter-level director mode for NovelAI', () => {
      const cap = getImageReferenceCapability(AI_ADAPTER_TYPES.NOVELAI)
      if (cap.kind !== 'flexible') throw new Error('expected flexible')
      expect(cap.mode).toBe('director')
    })
  })

  describe('getVideoReferenceCapability', () => {
    it('default video model is optional (min=0, max=1)', () => {
      const cap = getVideoReferenceCapability(AI_MODELS.WAN_VIDEO)
      if (cap.kind !== 'flexible') throw new Error('expected flexible')
      expect(cap.min).toBe(0)
      expect(cap.max).toBe(1)
      expect(cap.defaultRole).toBe('general')
    })

    it('Runway Gen4 Turbo requires a reference image (min=1)', () => {
      const cap = getVideoReferenceCapability(AI_MODELS.RUNWAY_GEN4_TURBO)
      if (cap.kind !== 'flexible') throw new Error('expected flexible')
      expect(cap.min).toBe(1)
      expect(cap.max).toBe(1)
    })

    it('Runway Gen3 requires a reference image', () => {
      const cap = getVideoReferenceCapability(AI_MODELS.RUNWAY_GEN3)
      if (cap.kind !== 'flexible') throw new Error('expected flexible')
      expect(cap.min).toBe(1)
    })
  })

  describe('getReferenceCapability surface routing', () => {
    it("routes surface='video' to the video wrapper", () => {
      const cap = getReferenceCapability(
        'video',
        AI_ADAPTER_TYPES.FAL,
        AI_MODELS.RUNWAY_GEN4_TURBO,
      )
      if (cap.kind !== 'flexible') throw new Error('expected flexible')
      expect(cap.min).toBe(1)
      expect(cap.max).toBe(1)
    })

    it("routes surface='image' to the image wrapper", () => {
      const cap = getReferenceCapability('image', AI_ADAPTER_TYPES.GEMINI)
      if (cap.kind !== 'flexible') throw new Error('expected flexible')
      expect(cap.max).toBe(14)
    })

    it("returns kind:none for surface='video' without a modelId", () => {
      const cap = getReferenceCapability('video', AI_ADAPTER_TYPES.FAL)
      expect(cap.kind).toBe('none')
    })
  })

  describe('getReferenceCapabilityMax', () => {
    it('returns 0 for none', () => {
      expect(getReferenceCapabilityMax({ kind: 'none' })).toBe(0)
    })

    it('returns max for flexible', () => {
      expect(
        getReferenceCapabilityMax({
          kind: 'flexible',
          min: 0,
          max: 4,
          defaultRole: 'general',
          mode: 'native',
        }),
      ).toBe(4)
    })

    it('returns slot count for slotted', () => {
      expect(
        getReferenceCapabilityMax({
          kind: 'slotted',
          slots: [
            { role: 'first_frame', required: true },
            { role: 'last_frame', required: false },
          ],
        }),
      ).toBe(2)
    })
  })

  describe('isReferenceImageRequired', () => {
    it('returns false for none', () => {
      expect(isReferenceImageRequired({ kind: 'none' })).toBe(false)
    })

    it('returns false for flexible with min=0', () => {
      expect(
        isReferenceImageRequired({
          kind: 'flexible',
          min: 0,
          max: 1,
          defaultRole: 'general',
          mode: 'native',
        }),
      ).toBe(false)
    })

    it('returns true for flexible with min>=1', () => {
      expect(
        isReferenceImageRequired({
          kind: 'flexible',
          min: 1,
          max: 1,
          defaultRole: 'general',
          mode: 'native',
        }),
      ).toBe(true)
    })

    it('returns true when any slot is required', () => {
      expect(
        isReferenceImageRequired({
          kind: 'slotted',
          slots: [{ role: 'first_frame', required: true }],
        }),
      ).toBe(true)
    })

    it('returns false when no slot is required', () => {
      expect(
        isReferenceImageRequired({
          kind: 'slotted',
          slots: [{ role: 'first_frame', required: false }],
        }),
      ).toBe(false)
    })
  })
})
