import 'server-only'

import { db } from '@/lib/db'

interface ModelWinStat {
  total: number
  wins: number
}

const DEFAULT_MIN_MATCHES = 5

/**
 * Returns per-model win rates for a taskType using voted Arena matches.
 */
export async function getModelWinRatesByTask(
  taskType: string,
  minMatches = DEFAULT_MIN_MATCHES,
): Promise<Map<string, number>> {
  const matches = await db.arenaMatch.findMany({
    where: {
      taskType,
      winnerId: { not: null },
    },
    select: {
      winnerId: true,
      entries: {
        select: {
          id: true,
          modelId: true,
        },
      },
    },
  })

  const stats = new Map<string, ModelWinStat>()

  for (const match of matches) {
    for (const entry of match.entries) {
      const current = stats.get(entry.modelId) ?? { total: 0, wins: 0 }
      current.total += 1
      if (entry.id === match.winnerId) {
        current.wins += 1
      }
      stats.set(entry.modelId, current)
    }
  }

  const winRates = new Map<string, number>()

  for (const [modelId, stat] of stats.entries()) {
    if (stat.total >= minMatches) {
      winRates.set(modelId, stat.wins / stat.total)
    }
  }

  return winRates
}
