import 'server-only'

import type { AspectRatio } from '@/constants/config'
import { AI_MODELS, getModelById } from '@/constants/models'
import {
  getReferenceCapabilityMax,
  getVideoReferenceCapability,
} from '@/constants/reference-image-capabilities'
import { getVideoModelCapabilities } from '@/constants/video-model-capabilities'
import type { VideoResolution } from '@/constants/video-options'
import { GenerateImageServiceError } from '@/services/generate-image.service'

interface ValidateVideoGenerationInput {
  modelId: string
  aspectRatio: AspectRatio
  /** Either a clamped number or 'auto' (Seedance literal); 'auto' skips numeric range checks. */
  duration?: number | 'auto'
  referenceImage?: string
  referenceImages?: string[]
  resolution?: VideoResolution
}

function formatAllowedValues(values: readonly (number | string)[]): string {
  return values
    .map((value) => (typeof value === 'number' ? `${value}s` : value))
    .join(', ')
}

const RUNWAY_GEN45_TEXT_TO_VIDEO_ASPECT_RATIOS: readonly AspectRatio[] = [
  '16:9',
  '9:16',
]

export function validateVideoGenerationInput({
  modelId,
  aspectRatio,
  duration,
  referenceImage,
  referenceImages,
  resolution,
}: ValidateVideoGenerationInput): void {
  const modelConfig = getModelById(modelId)

  // Custom/BYOK models do not have centralized capability metadata yet.
  if (!modelConfig) {
    return
  }

  if (modelConfig.outputType !== 'VIDEO') {
    throw new GenerateImageServiceError(
      'UNSUPPORTED_MODEL',
      'Selected model does not support video generation',
      400,
    )
  }

  const capabilities = getVideoModelCapabilities(modelId)

  // Defence-in-depth: front-end already caps reference count via the
  // capability layer, but a malicious / out-of-date client could still post
  // an over-cap array. Reject before sending to fal so the user gets a
  // structured error instead of a 4xx from the provider.
  const refCount = referenceImages?.length ?? (referenceImage ? 1 : 0)
  const refCap = getReferenceCapabilityMax(getVideoReferenceCapability(modelId))
  if (refCount > refCap) {
    throw new GenerateImageServiceError(
      'REFERENCE_IMAGE_LIMIT_EXCEEDED',
      `This model accepts at most ${refCap} reference ${refCap === 1 ? 'image' : 'images'} (got ${refCount}).`,
      400,
    )
  }

  const hasReferenceImage = refCount > 0
  if (capabilities.requiresReferenceImage && !hasReferenceImage) {
    throw new GenerateImageServiceError(
      'VALIDATION_ERROR',
      'This video model requires a reference image',
      400,
    )
  }

  // 'auto' bypasses the numeric range/enum checks — the model decides the
  // duration itself, so we can't validate it against a fixed allow-list.
  if (
    typeof duration === 'number' &&
    capabilities.supportedDurations &&
    !capabilities.supportedDurations.includes(duration)
  ) {
    throw new GenerateImageServiceError(
      'VALIDATION_ERROR',
      `Unsupported duration for this model. Allowed values: ${formatAllowedValues(capabilities.supportedDurations)}`,
      400,
    )
  }

  if (
    resolution &&
    capabilities.supportedResolutions &&
    !capabilities.supportedResolutions.includes(resolution)
  ) {
    throw new GenerateImageServiceError(
      'VALIDATION_ERROR',
      `Unsupported resolution for this model. Allowed values: ${formatAllowedValues(capabilities.supportedResolutions)}`,
      400,
    )
  }

  if (
    capabilities.supportedAspectRatios &&
    !capabilities.supportedAspectRatios.includes(aspectRatio)
  ) {
    throw new GenerateImageServiceError(
      'VALIDATION_ERROR',
      `Unsupported aspect ratio for this model. Allowed values: ${formatAllowedValues(capabilities.supportedAspectRatios)}`,
      400,
    )
  }

  if (
    modelConfig.id === AI_MODELS.RUNWAY_GEN45 &&
    !hasReferenceImage &&
    !RUNWAY_GEN45_TEXT_TO_VIDEO_ASPECT_RATIOS.includes(aspectRatio)
  ) {
    throw new GenerateImageServiceError(
      'VALIDATION_ERROR',
      `Unsupported aspect ratio for Runway Gen-4.5 text-to-video. Allowed values: ${formatAllowedValues(RUNWAY_GEN45_TEXT_TO_VIDEO_ASPECT_RATIOS)}`,
      400,
    )
  }

  // 'auto' is a model-side decision — no resolution/duration matrix check.
  if (
    !resolution ||
    typeof duration !== 'number' ||
    !capabilities.resolutionDurationMatrix
  ) {
    return
  }

  const allowedDurations = capabilities.resolutionDurationMatrix[resolution]
  if (!allowedDurations || allowedDurations.includes(duration)) {
    return
  }

  throw new GenerateImageServiceError(
    'VALIDATION_ERROR',
    `Unsupported duration for ${resolution}. Allowed values: ${formatAllowedValues(allowedDurations)}`,
    400,
  )
}
