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

export function getGenerationPreviewUrl(generation: GenerationRecord): string {
  return generation.previewUrl ?? generation.thumbnailUrl ?? generation.url
}
