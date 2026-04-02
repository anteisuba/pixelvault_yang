import type { GenerationRecord } from '@/types'

import { parseGenerationSnapshot } from '@/lib/studio-remix'

type TimestampLike = Date | string | number | null | undefined

export interface StudioCardUsageMap {
  character: Record<string, number>
  background: Record<string, number>
  style: Record<string, number>
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
    setMostRecentTimestamp(usage.character, snapshot.characterCardId, timestamp)
    setMostRecentTimestamp(
      usage.background,
      snapshot.backgroundCardId,
      timestamp,
    )
    setMostRecentTimestamp(usage.style, snapshot.styleCardId, timestamp)
  }

  return usage
}
