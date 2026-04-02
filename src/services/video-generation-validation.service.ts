import type { AspectRatio } from '@/constants/config'
import { getModelById } from '@/constants/models'
import { getVideoModelCapabilities } from '@/constants/video-model-capabilities'
import type { VideoResolution } from '@/constants/video-options'
import { GenerateImageServiceError } from '@/services/generate-image.service'

interface ValidateVideoGenerationInput {
  modelId: string
  aspectRatio: AspectRatio
  duration?: number
  referenceImage?: string
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

  if (capabilities.requiresReferenceImage && !referenceImage) {
    throw new GenerateImageServiceError(
      'VALIDATION_ERROR',
      'This video model requires a reference image',
      400,
    )
  }

  if (
    duration != null &&
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

  if (!resolution || duration == null || !capabilities.resolutionDurationMatrix) {
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
