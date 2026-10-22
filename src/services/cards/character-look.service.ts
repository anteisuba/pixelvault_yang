import 'server-only'

import { CHARACTER_CARD } from '@/constants/cards/character-card'
import { db } from '@/lib/db'
import { ApiRequestError } from '@/lib/errors'
import type { Prisma } from '@/lib/generated/prisma/client'
import {
  CHARACTER_LOOKS_INCLUDE,
  mapCharacterCardRow,
  serializeReferenceSlots,
} from '@/services/cards/character-card.mapper'
import { ensureUser } from '@/services/user.service'
import type {
  CharacterCardRecord,
  CreateCharacterLookRequest,
  UpdateCharacterLookRequest,
} from '@/types'

/**
 * 角色的造型（角色④，2026-10-22）：增、改、删、设默认。每个写操作都返回整个角色，
 * 客户端直接替换手里那一份。
 *
 * ⭐ 不变量：每个角色至少一套造型、恰有一套默认。名字可以空着（界面显示「默认」或
 * 「造型 N」）——默认换人时原默认往往没名字，⛔ 不替用户编一个。
 */

function lookError(
  code: 'NOT_FOUND' | 'LOOK_LIMIT' | 'LAST_LOOK',
): ApiRequestError {
  switch (code) {
    case 'NOT_FOUND':
      return new ApiRequestError(
        'NOT_FOUND',
        404,
        'errors.characterLook.notFound',
        'Look not found',
      )
    case 'LOOK_LIMIT':
      return new ApiRequestError(
        'LOOK_LIMIT',
        400,
        'errors.characterLook.limit',
        `At most ${CHARACTER_CARD.MAX_LOOKS_PER_CARD} looks per character`,
      )
    case 'LAST_LOOK':
      return new ApiRequestError(
        'LAST_LOOK',
        400,
        'errors.characterLook.lastLook',
        'A character needs at least one look',
      )
  }
}

async function readCard(cardId: string): Promise<CharacterCardRecord> {
  const card = await db.characterCard.findUniqueOrThrow({
    where: { id: cardId },
    include: CHARACTER_LOOKS_INCLUDE,
  })
  return mapCharacterCardRow(card)
}

/** 本人、没删的角色；否则 404。 */
async function ownedCard(clerkId: string, cardId: string) {
  const user = await ensureUser(clerkId)
  const card = await db.characterCard.findUnique({
    where: { id: cardId },
    select: { id: true, userId: true, isDeleted: true },
  })
  if (!card || card.userId !== user.id || card.isDeleted)
    throw lookError('NOT_FOUND')
  return card
}

/** 本人角色上的一套造型；否则 404。 */
async function ownedLook(clerkId: string, lookId: string) {
  const user = await ensureUser(clerkId)
  const look = await db.characterLook.findUnique({
    where: { id: lookId },
    include: {
      characterCard: { select: { userId: true, isDeleted: true } },
    },
  })
  if (
    !look ||
    look.characterCard.userId !== user.id ||
    look.characterCard.isDeleted
  )
    throw lookError('NOT_FOUND')
  return look
}

/** 新造型排在最后；带 `copyFromLookId` 就从那套复制文字、标签和图。 */
export async function createCharacterLook(
  clerkId: string,
  cardId: string,
  input: CreateCharacterLookRequest,
): Promise<CharacterCardRecord> {
  await ownedCard(clerkId, cardId)
  const looks = await db.characterLook.findMany({
    where: { characterCardId: cardId },
    select: { id: true, sortOrder: true },
  })
  if (looks.length >= CHARACTER_CARD.MAX_LOOKS_PER_CARD)
    throw lookError('LOOK_LIMIT')

  const source = input.copyFromLookId
    ? await db.characterLook.findFirst({
        where: { id: input.copyFromLookId, characterCardId: cardId },
      })
    : null
  if (input.copyFromLookId && !source) throw lookError('NOT_FOUND')

  await db.characterLook.create({
    data: {
      characterCardId: cardId,
      label: input.label,
      isDefault: false,
      description: source?.description ?? null,
      tags: source?.tags ?? [],
      referenceSlots: (source?.referenceSlots ?? []) as Prisma.InputJsonValue,
      sortOrder: Math.max(0, ...looks.map((look) => look.sortOrder)) + 1,
    },
  })
  await db.characterCard.update({
    where: { id: cardId },
    data: { updatedAt: new Date() },
  })
  return readCard(cardId)
}

export async function updateCharacterLook(
  clerkId: string,
  lookId: string,
  input: UpdateCharacterLookRequest,
): Promise<CharacterCardRecord> {
  const look = await ownedLook(clerkId, lookId)
  const data: Prisma.CharacterLookUpdateInput = {}
  if (input.label !== undefined) data.label = input.label || null
  if (input.description !== undefined)
    data.description = input.description || null
  if (input.tags !== undefined) data.tags = input.tags
  if (input.referenceSlots !== undefined)
    data.referenceSlots = serializeReferenceSlots(input.referenceSlots)

  await db.$transaction(async (tx) => {
    if (input.isDefault && !look.isDefault) {
      // 原默认让位（恰有一套默认）。
      await tx.characterLook.updateMany({
        where: { characterCardId: look.characterCardId, isDefault: true },
        data: { isDefault: false },
      })
      data.isDefault = true
    }
    await tx.characterLook.update({ where: { id: lookId }, data })
    // 改造型也算改角色：角色页按最近修改排序，编译缓存按卡的版本认。
    await tx.characterCard.update({
      where: { id: look.characterCardId },
      data: { version: { increment: 1 } },
    })
  })
  return readCard(look.characterCardId)
}

/** 删一套造型：最后一套不能删；删的是默认造型时，排在最前的那套接任默认。 */
export async function deleteCharacterLook(
  clerkId: string,
  lookId: string,
): Promise<CharacterCardRecord> {
  const look = await ownedLook(clerkId, lookId)
  const others = await db.characterLook.findMany({
    where: { characterCardId: look.characterCardId, id: { not: lookId } },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, label: true },
  })
  if (others.length === 0) throw lookError('LAST_LOOK')

  await db.$transaction(async (tx) => {
    await tx.characterLook.delete({ where: { id: lookId } })
    if (look.isDefault)
      await tx.characterLook.update({
        where: { id: others[0]!.id },
        data: { isDefault: true },
      })
    await tx.characterCard.update({
      where: { id: look.characterCardId },
      data: { version: { increment: 1 } },
    })
  })
  return readCard(look.characterCardId)
}
