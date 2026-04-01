import type { AspectRatio } from '@/constants/config'
import type { StudioModelOption } from '@/components/business/ModelSelector'
import type { GenerationRecord } from '@/types'

import { buildStudioRemixPreset, parseGenerationSnapshot } from '@/lib/studio-remix'

type TimestampLike = Date | string | number | null | undefined

export interface StudioCardUsageMap {
  character: Record<string, number>
  background: Record<string, number>
  style: Record<string, number>
}

export interface RecentStudioConfiguration {
  generationId: string
  prompt: string
  aspectRatio: AspectRatio
  optionId: string | null
  workflowMode: 'quick' | 'card'
  characterCardId: string | null
  backgroundCardId: string | null
  styleCardId: string | null
  modelId: string | null
  createdAtMs: number
}

function toTimestampMs(value: TimestampLike): number {
  if (value instanceof Date) {
    return value.getTime()
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? 0 : parsed
  }

  return 0
}

function setMostRecentTimestamp(
  target: Record<string, number>,
  id: string | undefined,
  timestamp: number,
) {
  if (!id || timestamp <= 0) {
    return
  }

  const current = target[id] ?? 0
  if (timestamp > current) {
    target[id] = timestamp
  }
}

export function buildStudioCardUsageMap(
  history: GenerationRecord[],
): StudioCardUsageMap {
  const usage: StudioCardUsageMap = {
    character: {},
    background: {},
    style: {},
  }

  for (const generation of history) {
    const snapshot = parseGenerationSnapshot(generation.snapshot)
    if (!snapshot) {
      continue
    }

    const timestamp = toTimestampMs(generation.createdAt)
    setMostRecentTimestamp(
      usage.character,
      snapshot.characterCardId,
      timestamp,
    )
    setMostRecentTimestamp(
      usage.background,
      snapshot.backgroundCardId,
      timestamp,
    )
    setMostRecentTimestamp(usage.style, snapshot.styleCardId, timestamp)
  }

  return usage
}

export function buildRecentStudioConfigurations(
  history: GenerationRecord[],
  options: StudioModelOption[],
  limit = 3,
): RecentStudioConfiguration[] {
  const recentConfigurations: RecentStudioConfiguration[] = []
  const seenConfigurations = new Set<string>()

  for (const generation of history) {
    if (generation.outputType !== 'IMAGE') {
      continue
    }

    const remixPreset = buildStudioRemixPreset(generation, options)
    const snapshot = remixPreset.snapshot
    const workflowMode =
      snapshot?.characterCardId || snapshot?.backgroundCardId || snapshot?.styleCardId
        ? 'card'
        : 'quick'

    const configurationKey = [
      workflowMode,
      remixPreset.optionId ?? snapshot?.apiKeyId ?? generation.model,
      remixPreset.aspectRatio,
      snapshot?.characterCardId ?? '',
      snapshot?.backgroundCardId ?? '',
      snapshot?.styleCardId ?? '',
    ].join('|')

    if (seenConfigurations.has(configurationKey)) {
      continue
    }

    seenConfigurations.add(configurationKey)
    recentConfigurations.push({
      generationId: generation.id,
      prompt: remixPreset.prompt,
      aspectRatio: remixPreset.aspectRatio,
      optionId: remixPreset.optionId,
      workflowMode,
      characterCardId: snapshot?.characterCardId ?? null,
      backgroundCardId: snapshot?.backgroundCardId ?? null,
      styleCardId: snapshot?.styleCardId ?? null,
      modelId: snapshot?.modelId ?? generation.model,
      createdAtMs: toTimestampMs(generation.createdAt),
    })

    if (recentConfigurations.length >= limit) {
      break
    }
  }

  return recentConfigurations
}
