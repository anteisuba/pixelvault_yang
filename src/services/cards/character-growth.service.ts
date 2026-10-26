import 'server-only'

import { CHARACTER_GROWTH_PAGE } from '@/constants/cards'
import { db } from '@/lib/db'
import { ensureUser } from '@/services/user.service'
import type { CharacterGrowth } from '@/types/character-growth'

import { revertCharacterRevision } from './character-revision.service'

/**
 * **她的成长**（10-26「更像真人」C 第 3 步）：设置「她」那一页的读与撤回。
 *
 * ⚠ ownership：卡不是你的 / 已删 → `null`（路由出 404），⛔ 不回空列表装作没有。
 */

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

export async function getCharacterGrowthForClerkId(
  clerkId: string,
  cardId: string,
): Promise<CharacterGrowth | null> {
  const user = await ensureUser(clerkId)
  const card = await db.characterCard.findFirst({
    where: { id: cardId, userId: user.id, isDeleted: false },
    select: {
      journals: {
        orderBy: { createdAt: 'desc' },
        take: CHARACTER_GROWTH_PAGE.journals,
        select: { id: true, text: true, createdAt: true },
      },
      revisions: {
        orderBy: { createdAt: 'desc' },
        take: CHARACTER_GROWTH_PAGE.revisions,
        select: {
          id: true,
          source: true,
          fields: true,
          before: true,
          after: true,
          reason: true,
          revertedAt: true,
          createdAt: true,
        },
      },
    },
  })
  if (!card) return null
  return {
    journals: card.journals.map((entry) => ({
      ...entry,
      createdAt: entry.createdAt.toISOString(),
    })),
    revisions: card.revisions.map((row) => ({
      ...row,
      before: asRecord(row.before),
      after: asRecord(row.after),
      revertedAt: row.revertedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
  }
}

/** 撤回一条。撤过的、不是你的、卡已删的 → `null`（404）。 */
export async function revertCharacterRevisionForClerkId(
  clerkId: string,
  revisionId: string,
): Promise<{ reverted: true } | null> {
  const user = await ensureUser(clerkId)
  return (await revertCharacterRevision(user.id, revisionId))
    ? { reverted: true }
    : null
}
