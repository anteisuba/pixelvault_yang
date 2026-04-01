import type { StudioModelOption } from '@/components/business/ModelSelector'
import { STUDIO_IMAGE_ASPECT_RATIOS } from '@/constants/studio'
import type { GenerationRecord, GenerationSnapshot } from '@/types'
import { GenerationSnapshotSchema } from '@/types'

type SupportedStudioAspectRatio =
  (typeof STUDIO_IMAGE_ASPECT_RATIOS)[number]

export interface StudioRemixPreset {
  prompt: string
  aspectRatio: SupportedStudioAspectRatio
  optionId: string | null
  snapshot: GenerationSnapshot | null
}

export function parseGenerationSnapshot(
  snapshot: unknown,
): GenerationSnapshot | null {
  const parsed = GenerationSnapshotSchema.safeParse(snapshot)
  return parsed.success ? parsed.data : null
}

function isSupportedStudioAspectRatio(
  value: string | undefined,
): value is SupportedStudioAspectRatio {
  return STUDIO_IMAGE_ASPECT_RATIOS.some((ratio) => ratio === value)
}

function resolveClosestStudioAspectRatio(
  width: number,
  height: number,
): SupportedStudioAspectRatio {
  const safeWidth = Math.max(width, 1)
  const safeHeight = Math.max(height, 1)
  const actualRatio = safeWidth / safeHeight

  return STUDIO_IMAGE_ASPECT_RATIOS.reduce<SupportedStudioAspectRatio>(
    (closest, candidate) => {
      const candidateValue =
        candidate === '1:1' ? 1 : candidate === '16:9' ? 16 / 9 : 9 / 16
      const closestValue =
        closest === '1:1' ? 1 : closest === '16:9' ? 16 / 9 : 9 / 16

      return Math.abs(candidateValue - actualRatio) <
        Math.abs(closestValue - actualRatio)
        ? candidate
        : closest
    },
    '1:1',
  )
}

function resolveOptionId(
  generation: GenerationRecord,
  snapshot: GenerationSnapshot | null,
  options: StudioModelOption[],
): string | null {
  if (snapshot?.apiKeyId) {
    const savedRoute = options.find((option) => option.keyId === snapshot.apiKeyId)
    if (savedRoute) {
      return savedRoute.optionId
    }
  }

  const modelId = snapshot?.modelId ?? generation.model
  const matchedOption = options.find((option) => option.modelId === modelId)
  return matchedOption?.optionId ?? null
}

export function getGenerationPromptPreview(generation: GenerationRecord): string {
  const snapshot = parseGenerationSnapshot(generation.snapshot)
  const prompt = snapshot?.freePrompt?.trim() || generation.prompt.trim()
  return prompt
}

export function buildStudioRemixPreset(
  generation: GenerationRecord,
  options: StudioModelOption[],
): StudioRemixPreset {
  const snapshot = parseGenerationSnapshot(generation.snapshot)
  const prompt = snapshot?.freePrompt?.trim() || generation.prompt.trim()
  const aspectRatio = isSupportedStudioAspectRatio(snapshot?.aspectRatio)
    ? snapshot.aspectRatio
    : resolveClosestStudioAspectRatio(generation.width, generation.height)

  return {
    prompt,
    aspectRatio,
    optionId: resolveOptionId(generation, snapshot, options),
    snapshot,
  }
}
