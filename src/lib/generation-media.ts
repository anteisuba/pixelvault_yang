import type { GenerationRecord } from '@/types'

export interface GenerationAudioSegment {
  text: string
  start: number
  end: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toGenerationAudioSegment(
  value: unknown,
): GenerationAudioSegment | null {
  if (!isRecord(value)) return null

  const { text, start, end } = value
  if (
    typeof text !== 'string' ||
    typeof start !== 'number' ||
    typeof end !== 'number' ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end <= start
  ) {
    return null
  }

  const trimmedText = text.trim()
  if (!trimmedText) return null

  return {
    text: trimmedText,
    start,
    end,
  }
}

export function getGenerationAudioSegments(
  generation: Pick<GenerationRecord, 'snapshot'> | null | undefined,
): GenerationAudioSegment[] {
  if (!generation || !isRecord(generation.snapshot)) return []

  const rawSegments =
    generation.snapshot.timestamps ?? generation.snapshot.segments
  if (!Array.isArray(rawSegments)) return []

  return rawSegments
    .map(toGenerationAudioSegment)
    .filter((segment): segment is GenerationAudioSegment => segment !== null)
}

export function getGenerationThumbnailUrl(
  generation: GenerationRecord,
): string {
  return generation.thumbnailUrl ?? generation.previewUrl ?? generation.url
}

/**
 * Persisted render frame for a 3D generation. The worker initially stores the
 * GLB in both `url` and `modelUrl`; after the browser captures a frame, the
 * poster endpoint replaces `url` with an image while `modelUrl` keeps the GLB.
 */
export function getGenerationModel3DPosterUrl(
  generation: GenerationRecord,
): string | null {
  if (generation.outputType !== 'MODEL_3D') return null

  const derivedPoster = generation.thumbnailUrl ?? generation.previewUrl
  if (derivedPoster) return derivedPoster

  const urlIsPoster =
    generation.mimeType.startsWith('image/') &&
    generation.url !== generation.modelUrl
  return urlIsPoster ? generation.url : null
}

/**
 * Best still image for a 3D tile/loading state. A source image is an honest
 * fallback while a render poster has not been captured yet; the GLB itself is
 * never a valid image source.
 */
export function getGenerationModel3DVisualUrl(
  generation: GenerationRecord,
): string | null {
  return (
    getGenerationModel3DPosterUrl(generation) ??
    generation.referenceImageUrl ??
    null
  )
}

/**
 * Best source for a *full-size* view (detail sheet, gallery detail, modal).
 *
 * `thumbnailUrl` is a grid tile, long-edge capped by
 * `IMAGE_PREVIEW_VARIANTS.thumbnail` — it must never win here. User uploads
 * deliberately derive only a thumbnail (see `createImageThumbnailAsset`,
 * "a stored upload serves its full original in the detail view"), so for an
 * IMAGE a missing `previewUrl` means *the original is the preview*. Falling
 * through to the thumbnail instead blew every uploaded image up from 384px
 * to the full viewport — a ~3.5x upscale of a q78 WebP, which is what
 * "上传的图片画质很低" actually was.
 *
 * VIDEO / AUDIO / MODEL_3D keep the thumbnail step: their `url` is a media
 * file, not a displayable image, so a poster/cover derivative is the only
 * valid image source.
 */
export function getGenerationPreviewUrl(generation: GenerationRecord): string {
  if (generation.outputType === 'IMAGE') {
    return generation.previewUrl ?? generation.url
  }
  return generation.previewUrl ?? generation.thumbnailUrl ?? generation.url
}
