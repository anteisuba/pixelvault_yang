import 'server-only'

import { db } from '@/lib/db'
import { ARENA } from '@/constants/config'
import type { AspectRatio } from '@/constants/config'
import type {
  ArenaMatchRecord,
  ArenaEntryRecord,
  EloUpdate,
  LeaderboardEntry,
} from '@/types'
import { generateImageForUser } from '@/services/generate-image.service'
import { ensureUser } from '@/services/user.service'

// ─── Match Creation ──────────────────────────────────────────────

export interface CreateArenaMatchInput {
  prompt: string
  aspectRatio: AspectRatio
  referenceImage?: string
}

/**
 * Creates a match record only — no image generation.
 * Frontend will call generateArenaEntry() for each model in parallel.
 */
export async function createArenaMatch(
  clerkId: string,
  input: CreateArenaMatchInput,
): Promise<string> {
  const dbUser = await ensureUser(clerkId)

  const match = await db.arenaMatch.create({
    data: {
      userId: dbUser.id,
      prompt: input.prompt,
      aspectRatio: input.aspectRatio,
    },
  })

  return match.id
}

// ─── Entry Generation (one model per request) ───────────────────

export interface GenerateArenaEntryInput {
  modelId: string
  apiKeyId?: string
  slotIndex: number
}

/**
 * Generates one image for a match and creates an ArenaEntry.
 * Each call has its own serverless timeout (240s), so N models
 * can be generated in parallel without cumulative timeout risk.
 */
export async function generateArenaEntry(
  matchId: string,
  clerkId: string,
  input: GenerateArenaEntryInput,
): Promise<ArenaEntryRecord> {
  const dbUser = await ensureUser(clerkId)

  const match = await db.arenaMatch.findUnique({
    where: { id: matchId },
  })

  if (!match || match.userId !== dbUser.id) {
    throw new Error('Match not found')
  }

  if (match.votedAt) {
    throw new Error('Match already voted')
  }

  const generation = await generateImageForUser(clerkId, {
    prompt: match.prompt,
    modelId: input.modelId,
    aspectRatio: match.aspectRatio as AspectRatio,
    apiKeyId: input.apiKeyId,
  })

  const entry = await db.arenaEntry.create({
    data: {
      matchId,
      generationId: generation.id,
      modelId: input.modelId,
      slotIndex: input.slotIndex,
    },
  })

  return {
    id: entry.id,
    slotIndex: entry.slotIndex,
    modelId: '', // Always hide model before voting
    status: 'completed',
    imageUrl: generation.url,
    wasVoted: false,
  }
}

// ─── Match Retrieval ─────────────────────────────────────────────

export async function getArenaMatch(
  matchId: string,
  clerkId: string,
): Promise<ArenaMatchRecord | null> {
  const dbUser = await ensureUser(clerkId)

  const match = await db.arenaMatch.findUnique({
    where: { id: matchId },
    include: {
      entries: {
        include: { generation: true },
        orderBy: { slotIndex: 'asc' },
      },
    },
  })

  if (!match || match.userId !== dbUser.id) return null

  const entries: ArenaEntryRecord[] = match.entries.map((entry) => ({
    id: entry.id,
    slotIndex: entry.slotIndex,
    modelId: match.votedAt ? entry.modelId : '', // Hide model name before voting
    status: 'completed' as const,
    imageUrl: entry.generation.url,
    wasVoted: entry.wasVoted,
  }))

  return {
    id: match.id,
    prompt: match.prompt,
    aspectRatio: match.aspectRatio,
    winnerId: match.winnerId,
    votedAt: match.votedAt,
    createdAt: match.createdAt,
    entries,
  }
}

// ─── Voting + ELO ────────────────────────────────────────────────

function calculateElo(
  playerRating: number,
  opponentRating: number,
  actual: number,
): number {
  const expected = 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400))
  return playerRating + ARENA.K_FACTOR * (actual - expected)
}

async function getOrCreateEloRating(
  modelId: string,
): Promise<{ rating: number }> {
  const record = await db.modelEloRating.upsert({
    where: { modelId },
    create: { modelId, rating: ARENA.INITIAL_ELO },
    update: {},
  })

  return { rating: record.rating }
}

async function updateEloWithOptimisticLock(
  modelId: string,
  oldRating: number,
  newRating: number,
  isWinner: boolean,
): Promise<boolean> {
  const result = await db.modelEloRating.updateMany({
    where: { modelId, rating: oldRating },
    data: {
      rating: newRating,
      matchCount: { increment: 1 },
      ...(isWinner ? { winCount: { increment: 1 } } : {}),
    },
  })

  return result.count > 0
}

export async function submitArenaVote(
  matchId: string,
  winnerEntryId: string,
  clerkId: string,
): Promise<{ winnerId: string; eloUpdates: EloUpdate[] }> {
  const dbUser = await ensureUser(clerkId)

  const match = await db.arenaMatch.findUnique({
    where: { id: matchId },
    include: { entries: true },
  })

  if (!match || match.userId !== dbUser.id) {
    throw new Error('Match not found')
  }

  if (match.votedAt) {
    throw new Error('Match already voted')
  }

  const winnerEntry = match.entries.find((e) => e.id === winnerEntryId)
  if (!winnerEntry) {
    throw new Error('Invalid winner entry')
  }

  // Mark match as voted
  await db.arenaMatch.update({
    where: { id: matchId },
    data: { winnerId: winnerEntryId, votedAt: new Date() },
  })

  // Mark winner entry
  await db.arenaEntry.update({
    where: { id: winnerEntryId },
    data: { wasVoted: true },
  })

  // Compute ELO updates using 4-way → pairwise decomposition
  const eloUpdates: EloUpdate[] = []
  const modelIds = match.entries.map((e) => e.modelId)
  const ratings: Record<string, number> = {}

  for (const modelId of modelIds) {
    const { rating } = await getOrCreateEloRating(modelId)
    ratings[modelId] = rating
  }

  const newRatings: Record<string, number> = { ...ratings }

  // Winner vs each loser: winner gets Actual=1, loser gets Actual=0
  // Losers vs each other: Actual=0.5 (draw)
  for (let i = 0; i < modelIds.length; i++) {
    for (let j = i + 1; j < modelIds.length; j++) {
      const modelA = modelIds[i]
      const modelB = modelIds[j]
      const isAWinner = modelA === winnerEntry.modelId
      const isBWinner = modelB === winnerEntry.modelId

      let actualA: number
      let actualB: number

      if (isAWinner) {
        actualA = 1
        actualB = 0
      } else if (isBWinner) {
        actualA = 0
        actualB = 1
      } else {
        // Both losers — draw
        actualA = 0.5
        actualB = 0.5
      }

      newRatings[modelA] = calculateElo(
        newRatings[modelA],
        ratings[modelB],
        actualA,
      )
      newRatings[modelB] = calculateElo(
        newRatings[modelB],
        ratings[modelA],
        actualB,
      )
    }
  }

  // Persist ELO updates with optimistic concurrency (retry up to 3 times)
  for (const modelId of modelIds) {
    const oldRating = ratings[modelId]
    const newRating = Math.round(newRatings[modelId] * 10) / 10
    const isWinner = modelId === winnerEntry.modelId

    for (let attempt = 0; attempt < 3; attempt++) {
      const success = await updateEloWithOptimisticLock(
        modelId,
        attempt === 0
          ? oldRating
          : (await getOrCreateEloRating(modelId)).rating,
        newRating,
        isWinner,
      )
      if (success) break
    }

    eloUpdates.push({
      modelId,
      oldRating,
      newRating,
      change: Math.round((newRating - oldRating) * 10) / 10,
    })
  }

  return { winnerId: winnerEntryId, eloUpdates }
}

// ─── Leaderboard ─────────────────────────────────────────────────

export async function getArenaLeaderboard(): Promise<LeaderboardEntry[]> {
  const ratings = await db.modelEloRating.findMany({
    orderBy: { rating: 'desc' },
  })

  return ratings.map((r) => ({
    modelId: r.modelId,
    rating: Math.round(r.rating * 10) / 10,
    matchCount: r.matchCount,
    winCount: r.winCount,
    winRate:
      r.matchCount > 0
        ? Math.round((r.winCount / r.matchCount) * 1000) / 10
        : 0,
  }))
}
