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

import { AI_MODELS } from '@/constants/models'
import type { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  FAL_KLING_V3_MAX_REFERENCE_IMAGES,
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
 * Per-model overrides for the video surface.
 *
 * Most video models accept a single i2v "starting frame", so the default of
 * `{max: 1}` is right for them. Models listed here have richer endpoints that
 * really do accept more — the previous code wrapped a single image in `[x]`,
 * hiding the underlying capability.
 */
const VIDEO_MODEL_REFERENCE_OVERRIDES: Partial<
  Record<string, ReferenceImageCapability>
> = {
  // fal-ai/kling-video/v3/pro/image-to-video takes one start image plus an
  // optional element image set with `reference_image_urls` capped at 1-3.
  [AI_MODELS.KLING_V3_PRO]: {
    kind: 'flexible',
    min: 0,
    max: FAL_KLING_V3_MAX_REFERENCE_IMAGES,
    defaultRole: 'subject',
    mode: 'native',
  },
  // fal-ai/veo3.1/reference-to-video already posts `image_urls: string[]`.
  // Google's Veo 3.1 reference-to-video docs cap subject/scene references at
  // 3 images, so 3 is the right ceiling to expose to users.
  [AI_MODELS.VEO_31]: {
    kind: 'flexible',
    min: 0,
    max: 3,
    defaultRole: 'subject',
    mode: 'native',
  },
  // Seedance 2.0 reference-to-video accepts up to 9 reference images per the
  // fal docs. The default `{max: 1}` previously truncated the upstream image
  // harvest at one frame, surfacing as "3/1 refs" in the inspector.
  [AI_MODELS.SEEDANCE_20_REFERENCE]: {
    kind: 'flexible',
    min: 1,
    max: 9,
    defaultRole: 'subject',
    mode: 'native',
  },
  [AI_MODELS.SEEDANCE_20_FAST_REFERENCE]: {
    kind: 'flexible',
    min: 1,
    max: 9,
    defaultRole: 'subject',
    mode: 'native',
  },
}

/**
 * Video surface: most models take one i2v reference frame. Per-model overrides
 * (see VIDEO_MODEL_REFERENCE_OVERRIDES) expose richer endpoints — Veo 3.1
 * accepts up to 3 subject references, etc.
 */
export function getVideoReferenceCapability(
  modelId: string,
): ReferenceImageCapability {
  const override = VIDEO_MODEL_REFERENCE_OVERRIDES[modelId]
  if (override) return override
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
