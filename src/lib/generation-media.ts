import type { GenerationRecord } from '@/types'

export function getGenerationThumbnailUrl(
  generation: GenerationRecord,
): string {
  return generation.thumbnailUrl ?? generation.previewUrl ?? generation.url
}

export function getGenerationPreviewUrl(generation: GenerationRecord): string {
  return generation.previewUrl ?? generation.thumbnailUrl ?? generation.url
}
