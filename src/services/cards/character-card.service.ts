import 'server-only'

import { db } from '@/lib/db'
import { CHARACTER_CARD } from '@/constants/cards/character-card'
import { TAVERN_CARD_IMPORT_ERRORS } from '@/constants/cards/tavern-card'
import {
  type CharacterCardRecord,
  type CreateCharacterCardRequest,
  type UpdateCharacterCardRequest,
} from '@/types'
import { deriveCardHandleBase, deriveVariantHandleBase } from '@/lib/card-bus'
import { ApiRequestError } from '@/lib/errors'
import type { TavernCardImport } from '@/lib/tavern-card'
import { allocateHandleForNewCard } from '@/services/cards/card-handle.service'
import {
  mapCharacterCardRow,
  mergeCardExtensions,
  serializeCharacterCardV2Fields,
  serializeCharacterLoras,
  serializeReferenceSlots,
} from '@/services/cards/character-card.mapper'
import { generateStorageKey, uploadToR2 } from '@/services/storage/r2'
import { ensureUser } from '@/services/user.service'
import { ownedBy } from '@/lib/db-scope'

// ─── CRUD Operations ───────────────────────────────────────────

/**
 * 建卡：只有名字（外观 / 设定 / 标签可选）；图之后在详情里从素材库加进参考槽。
 * 带 `parentId` = 建在某张卡下面的造型。
 */
export async function createCharacterCard(
  clerkId: string,
  input: CreateCharacterCardRequest,
): Promise<CharacterCardRecord> {
  const dbUser = await ensureUser(clerkId)

  // Check card limit
  const count = await db.characterCard.count({
    where: { ...ownedBy(dbUser.id), isDeleted: false },
  })
  if (count >= CHARACTER_CARD.MAX_CARDS_PER_USER) {
    throw new Error(
      `Maximum ${CHARACTER_CARD.MAX_CARDS_PER_USER} character cards allowed`,
    )
  }

  // If creating as variant, verify parent ownership + variant limit
  const parent = input.parentId
    ? await db.characterCard.findUnique({
        where: { id: input.parentId },
        include: {
          _count: { select: { variants: { where: { isDeleted: false } } } },
        },
      })
    : null
  if (input.parentId) {
    if (!parent || parent.userId !== dbUser.id || parent.isDeleted) {
      throw new Error('Parent card not found')
    }
    if (parent._count.variants >= CHARACTER_CARD.MAX_VARIANTS_PER_CARD) {
      throw new Error(
        `Maximum ${CHARACTER_CARD.MAX_VARIANTS_PER_CARD} variants per card`,
      )
    }
  }

  // handle 跨两张表查重，所以读已占用与建卡放在同一个事务里。
  const handleBase = parent
    ? deriveVariantHandleBase(
        parent.handle ?? deriveCardHandleBase(parent.name),
        input.variantLabel,
      )
    : deriveCardHandleBase(input.name)
  const card = await db.$transaction(async (tx) =>
    tx.characterCard.create({
      data: {
        userId: dbUser.id,
        handle: await allocateHandleForNewCard(tx, dbUser.id, handleBase),
        name: input.name,
        description: input.description ?? null,
        summary: input.summary ?? null,
        ...(input.extensions
          ? { extensions: mergeCardExtensions(null, input.extensions) }
          : {}),
        referenceSlots: [],
        tags: input.tags ?? [],
        parentId: input.parentId ?? null,
        variantLabel: input.variantLabel ?? null,
        ...serializeCharacterCardV2Fields(input),
      },
    }),
  )

  return mapCharacterCardRow(card)
}

/**
 * **导入的酒馆卡建卡**（附录J ⑥；文件导入与卡库共用）：格子已由 `mapTavernCard`
 * 落好，卡图直接上 R2 当第一张参考图。⛔ 不跑视觉提取、不联网搜 —— 卡上写什么就是什么，
 * 外观之后在详情里补或交给卡片助手（与「新角色」只建名字同一条理由：不替用户花钱）。
 */
export async function createImportedCharacterCard(
  clerkId: string,
  imported: TavernCardImport,
  image: { data: Buffer; mimeType: string } | null,
): Promise<CharacterCardRecord> {
  const dbUser = await ensureUser(clerkId)

  const count = await db.characterCard.count({
    where: { ...ownedBy(dbUser.id), isDeleted: false },
  })
  if (count >= CHARACTER_CARD.MAX_CARDS_PER_USER) {
    const error = TAVERN_CARD_IMPORT_ERRORS.limitReached
    throw new ApiRequestError(
      error.code,
      error.httpStatus,
      error.i18nKey,
      `${error.message} (max ${CHARACTER_CARD.MAX_CARDS_PER_USER})`,
    )
  }

  const upload = image
    ? await (async () => {
        const storageKey = generateStorageKey('IMAGE', dbUser.id)
        const url = await uploadToR2({
          data: image.data,
          key: storageKey,
          mimeType: image.mimeType,
        })
        return { url }
      })()
    : null
  const card = await db.$transaction(async (tx) =>
    tx.characterCard.create({
      data: {
        userId: dbUser.id,
        handle: await allocateHandleForNewCard(
          tx,
          dbUser.id,
          deriveCardHandleBase(imported.name),
        ),
        name: imported.name,
        description: null,
        summary: imported.summary,
        extensions: mergeCardExtensions(null, imported.extensions),
        referenceSlots: upload
          ? serializeReferenceSlots([
              {
                id: 'slot-1',
                role: 'identity',
                url: upload.url,
                isPrimary: true,
                origin: 'upload',
              },
            ])
          : [],
        tags: imported.tags,
        ...serializeCharacterCardV2Fields({ persona: imported.persona }),
      },
    }),
  )

  return mapCharacterCardRow(card)
}

/**
 * List all non-deleted root character cards for a user, with their variants nested.
 */
export async function listCharacterCards(
  clerkId: string,
): Promise<CharacterCardRecord[]> {
  const dbUser = await ensureUser(clerkId)

  const cards = await db.characterCard.findMany({
    where: { userId: dbUser.id, isDeleted: false, parentId: null },
    orderBy: { updatedAt: 'desc' },
    include: {
      // 角色页按张数排名：卡上的图 + 用她出过的图（owner 09-26）。
      _count: { select: { generationLinks: true } },
      variants: {
        where: { isDeleted: false },
        orderBy: { updatedAt: 'desc' },
        include: { _count: { select: { generationLinks: true } } },
      },
    },
  })

  return cards.map((card) => mapCharacterCardRow(card))
}

/**
 * Get a single character card by ID, with ownership check.
 */
export async function getCharacterCard(
  clerkId: string,
  cardId: string,
): Promise<CharacterCardRecord | null> {
  const dbUser = await ensureUser(clerkId)

  const card = await db.characterCard.findUnique({
    where: { id: cardId },
    include: {
      variants: {
        where: { isDeleted: false },
        orderBy: { updatedAt: 'desc' },
      },
    },
  })

  if (!card || card.userId !== dbUser.id || card.isDeleted) return null

  return mapCharacterCardRow(card)
}

/**
 * Update a character card.
 */
export async function updateCharacterCard(
  clerkId: string,
  cardId: string,
  data: UpdateCharacterCardRequest,
): Promise<CharacterCardRecord | null> {
  const dbUser = await ensureUser(clerkId)

  const existing = await db.characterCard.findUnique({
    where: { id: cardId },
  })

  if (!existing || existing.userId !== dbUser.id || existing.isDeleted)
    return null

  const updateData: Record<string, unknown> = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.description !== undefined) updateData.description = data.description
  if (data.tags !== undefined) updateData.tags = data.tags
  if (data.variantLabel !== undefined)
    updateData.variantLabel = data.variantLabel
  if (data.loras !== undefined)
    updateData.loras = data.loras ? serializeCharacterLoras(data.loras) : null
  // 角色卡字段 v2 —— 透传落库，⛔ 不在这里加业务逻辑（cards.md「角色卡字段 v2」）。
  Object.assign(updateData, serializeCharacterCardV2Fields(data))
  if (data.referenceSlots !== undefined)
    updateData.referenceSlots = serializeReferenceSlots(data.referenceSlots)
  if (data.summary !== undefined) updateData.summary = data.summary
  if (data.extensions !== undefined)
    updateData.extensions = mergeCardExtensions(
      existing.extensions,
      data.extensions,
    )

  const card = await db.characterCard.update({
    where: { id: cardId },
    data: updateData,
    include: {
      variants: {
        where: { isDeleted: false },
        orderBy: { updatedAt: 'desc' },
      },
    },
  })

  return mapCharacterCardRow(card)
}

/**
 * Soft-delete a character card.
 */
export async function deleteCharacterCard(
  clerkId: string,
  cardId: string,
): Promise<boolean> {
  const dbUser = await ensureUser(clerkId)

  const existing = await db.characterCard.findUnique({
    where: { id: cardId },
  })

  if (!existing || existing.userId !== dbUser.id || existing.isDeleted)
    return false

  await db.characterCard.update({
    where: { id: cardId },
    data: { isDeleted: true },
  })

  return true
}
