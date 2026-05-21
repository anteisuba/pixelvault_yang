/**
 * Unified reference-image capability layer for image + video surfaces.
 *
 * Wraps the existing provider-capabilities (image) and video-model-capabilities
 * (video) getters into a single discriminated union so studio code can ask
 * "what reference images does this model accept?" without branching on surface.
 *
 * Step 1 of the reference-image redesign: pure addition, no downstream
 * consumers yet. Step 2 migrates UI to consume this and adds the
 * "preserve + mark disabled on model switch" behaviour. Step 3 introduces the
 * 'slotted' variant for first/last-frame video models.
 */

import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  getMaxReferenceImages,
  getReferenceImageMode,
  type ReferenceImageMode,
} from '@/constants/provider-capabilities'
import { getVideoModelCapabilities } from '@/constants/video-model-capabilities'

/**
 * Semantic role a reference image plays for a model.
 *
 * - 'general': model uses the image as a generic style/content reference.
 * - 'subject' / 'style': reserved for multi-role models (Kontext-style
 *   subject + scene compositing). Not emitted in Step 1.
 * - 'first_frame' / 'last_frame': video models that interpolate between two
 *   keyframes (Seedance last_frame_chain, Veo reference-to-video). Step 3.
 * - 'mask': inpainting / outpainting masks. Reserved.
 */
export type ReferenceSlotRole =
  | 'general'
  | 'subject'
  | 'style'
  | 'first_frame'
  | 'last_frame'
  | 'mask'

export interface ReferenceSlot {
  role: ReferenceSlotRole
  required: boolean
}

/**
 * What a model accepts as reference input.
 *
 * - 'none': model doesn't take reference images (UI hides the chip).
 * - 'flexible': 0..max images, all sharing one default role.
 * - 'slotted': explicit ordered slots with per-slot role and required-ness.
 *   Reserved for Step 3.
 */
export type ReferenceImageCapability =
  | { kind: 'none' }
  | {
      kind: 'flexible'
      min: number
      max: number
      defaultRole: ReferenceSlotRole
      mode: ReferenceImageMode
    }
  | { kind: 'slotted'; slots: readonly ReferenceSlot[] }

export type ReferenceImageSurface = 'image' | 'video'

/** Image surface: thin wrapper over provider-capabilities getters. */
export function getImageReferenceCapability(
  adapterType: AI_ADAPTER_TYPES,
  modelId?: string,
): ReferenceImageCapability {
  const max = getMaxReferenceImages(adapterType, modelId)
  if (max <= 0) return { kind: 'none' }
  return {
    kind: 'flexible',
    min: 0,
    max,
    defaultRole: 'general',
    mode: getReferenceImageMode(adapterType, modelId),
  }
}

/**
 * Video surface: every video model takes at most one reference image today
 * (i2v first frame). `requiresReferenceImage` flips `min` from 0 → 1. Step 3
 * will switch first/last-frame models to the 'slotted' shape.
 */
export function getVideoReferenceCapability(
  modelId: string,
): ReferenceImageCapability {
  const caps = getVideoModelCapabilities(modelId)
  return {
    kind: 'flexible',
    min: caps.requiresReferenceImage ? 1 : 0,
    max: 1,
    defaultRole: 'general',
    mode: 'native',
  }
}

/** Unified accessor for studio code regardless of surface. */
export function getReferenceCapability(
  surface: ReferenceImageSurface,
  adapterType: AI_ADAPTER_TYPES,
  modelId?: string,
): ReferenceImageCapability {
  if (surface === 'video') {
    // Video surface needs a model to say anything useful; fail closed.
    if (!modelId) return { kind: 'none' }
    return getVideoReferenceCapability(modelId)
  }
  return getImageReferenceCapability(adapterType, modelId)
}

/** Numeric max regardless of capability shape. */
export function getReferenceCapabilityMax(
  cap: ReferenceImageCapability,
): number {
  switch (cap.kind) {
    case 'none':
      return 0
    case 'flexible':
      return cap.max
    case 'slotted':
      return cap.slots.length
  }
}

/** Whether at least one reference image is required to generate. */
export function isReferenceImageRequired(
  cap: ReferenceImageCapability,
): boolean {
  switch (cap.kind) {
    case 'none':
      return false
    case 'flexible':
      return cap.min > 0
    case 'slotted':
      return cap.slots.some((s) => s.required)
  }
}
