import 'server-only'

import type { AspectRatio } from '@/constants/config'
import { getModelById } from '@/constants/models'
import { getVideoModelCapabilities } from '@/constants/video-model-capabilities'
import { getVideoModelSendContract } from '@/constants/video-model-send-plan'
import type { VideoResolution } from '@/constants/video-options'
import { GenerateImageServiceError } from '@/services/image/generate-image.service'

interface ValidateVideoGenerationInput {
  modelId: string
  aspectRatio: AspectRatio
  /** Either a clamped number or 'auto' (Seedance literal); 'auto' skips numeric range checks. */
  duration?: number | 'auto'
  referenceImage?: string
  referenceImages?: string[]
  audioUrls?: string[]
  videoUrls?: string[]
  resolution?: VideoResolution
}

function formatAllowedValues(values: readonly (number | string)[]): string {
  return values
    .map((value) => (typeof value === 'number' ? `${value}s` : value))
    .join(', ')
}

export function validateVideoGenerationInput({
  modelId,
  aspectRatio,
  duration,
  referenceImage,
  referenceImages,
  audioUrls,
  videoUrls,
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
  const sendContract = getVideoModelSendContract(
    modelId,
    modelConfig.adapterType,
  )
  const refCap = sendContract.slots.images
  if (typeof refCap === 'number' && refCount > refCap) {
    throw new GenerateImageServiceError(
      'REFERENCE_IMAGE_LIMIT_EXCEEDED',
      `This model accepts at most ${refCap} reference ${refCap === 1 ? 'image' : 'images'} (got ${refCount}).`,
      400,
    )
  }

  const videoCount = videoUrls?.length ?? 0
  const audioCount = audioUrls?.length ?? 0
  if (videoCount > sendContract.slots.videos) {
    throw new GenerateImageServiceError(
      'VALIDATION_ERROR',
      `This model accepts at most ${sendContract.slots.videos} reference videos (got ${videoCount}).`,
      400,
    )
  }
  if (audioCount > sendContract.slots.audio) {
    throw new GenerateImageServiceError(
      'VALIDATION_ERROR',
      `This model accepts at most ${sendContract.slots.audio} reference audio clips (got ${audioCount}).`,
      400,
    )
  }
  if (
    typeof sendContract.slots.total === 'number' &&
    refCount + videoCount + audioCount > sendContract.slots.total
  ) {
    throw new GenerateImageServiceError(
      'VALIDATION_ERROR',
      `This model accepts at most ${sendContract.slots.total} reference inputs in total.`,
      400,
    )
  }

  const hasReferenceImage = refCount > 0
  const hasVisualReference = hasReferenceImage || videoCount > 0
  if (
    sendContract.slots.audioRequiresVisual &&
    audioCount > 0 &&
    !hasVisualReference
  ) {
    throw new GenerateImageServiceError(
      'VALIDATION_ERROR',
      'Reference audio requires at least one reference image or video',
      400,
    )
  }
  if (
    capabilities.requiresReferenceImage &&
    sendContract.referenceMode !== 'multimodal-reference' &&
    !hasReferenceImage
  ) {
    throw new GenerateImageServiceError(
      'VALIDATION_ERROR',
      'This video model requires a reference image',
      400,
    )
  }
  if (
    sendContract.referenceMode === 'multimodal-reference' &&
    !hasVisualReference
  ) {
    throw new GenerateImageServiceError(
      'VALIDATION_ERROR',
      'This video model requires at least one reference image or video',
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
