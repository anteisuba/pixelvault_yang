import 'server-only'

import { db } from '@/lib/db'
import { CHARACTER_CARD } from '@/constants/cards/character-card'
import {
  TAVERN_CARD,
  TAVERN_CARD_IMPORT_ERRORS,
} from '@/constants/cards/tavern-card'
import {
  type CharacterCardRecord,
  type CreateCharacterCardRequest,
  type UpdateCharacterCardRequest,
} from '@/types'
import { deriveCardHandleBase } from '@/lib/card-bus'
import { ApiRequestError } from '@/lib/errors'
import type { TavernCardImport } from '@/lib/tavern-card'
import { allocateHandleForNewCard } from '@/services/cards/card-handle.service'
import {
  CHARACTER_LOOKS_INCLUDE,
  mapCharacterCardRow,
  mergeCardExtensions,
  serializeCharacterCardV2Fields,
  serializeReferenceSlots,
} from '@/services/cards/character-card.mapper'
import { generateStorageKey, uploadToR2 } from '@/services/storage/r2'
import { ensureUser } from '@/services/user.service'
import { ownedBy } from '@/lib/db-scope'

// ─── CRUD Operations ───────────────────────────────────────────

/**
 * 建卡：只有名字（外观 / 设定 / 标签可选）；同时建好默认造型，外观文字落在它上面。
 * 图之后在详情里从素材库加进造型的参考槽。
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

  // handle 跨两张表查重，所以读已占用与建卡放在同一个事务里。
  const card = await db.$transaction(async (tx) =>
    tx.characterCard.create({
      data: {
        userId: dbUser.id,
        handle: await allocateHandleForNewCard(
          tx,
          dbUser.id,
          deriveCardHandleBase(input.name),
        ),
        name: input.name,
        summary: input.summary ?? null,
        ...(input.extensions
          ? { extensions: mergeCardExtensions(null, input.extensions) }
          : {}),
        tags: input.tags ?? [],
        ...serializeCharacterCardV2Fields(input),
        looks: {
          create: {
            isDefault: true,
            description: input.description || null,
            referenceSlots: [],
          },
        },
      },
      include: CHARACTER_LOOKS_INCLUDE,
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
        summary: imported.summary,
        extensions: mergeCardExtensions(null, imported.extensions),
        tags: imported.tags,
        ...serializeCharacterCardV2Fields({ persona: imported.persona }),
        looks: {
          create: {
            isDefault: true,
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
          },
        },
      },
      include: CHARACTER_LOOKS_INCLUDE,
    }),
  )

  return mapCharacterCardRow(card)
}

/** 一个用户全部没删的角色（连同造型）。 */
export async function listCharacterCards(
  clerkId: string,
): Promise<CharacterCardRecord[]> {
  const dbUser = await ensureUser(clerkId)

  const cards = await db.characterCard.findMany({
    where: { userId: dbUser.id, isDeleted: false },
    orderBy: { updatedAt: 'desc' },
    include: {
      // 角色页按张数排名：卡上的图 + 用她出过的图（owner 09-26）。
      _count: { select: { generationLinks: true } },
      ...CHARACTER_LOOKS_INCLUDE,
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
    include: CHARACTER_LOOKS_INCLUDE,
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
  if (data.tags !== undefined) updateData.tags = data.tags
  // 角色卡字段 v2 —— 透传落库，⛔ 不在这里加业务逻辑（cards.md「角色卡字段 v2」）。
  Object.assign(updateData, serializeCharacterCardV2Fields(data))
  if (data.summary !== undefined) updateData.summary = data.summary
  if (data.isFavorite !== undefined) updateData.isFavorite = data.isFavorite
  if (data.extensions !== undefined)
    updateData.extensions = mergeCardExtensions(
      existing.extensions,
      data.extensions,
    )

  const card = await db.characterCard.update({
    where: { id: cardId },
    data: updateData,
    include: CHARACTER_LOOKS_INCLUDE,
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

/**
 * 复制一位（手机长按菜单「复制」）：名字换新，设定、标签、全部造型（文字 · 标签 · 图）
 * 和她收的 LoRA 都带上；酒馆原样存的那几格不带。
 */
export async function duplicateCharacterCard(
  clerkId: string,
  cardId: string,
  name: string,
): Promise<CharacterCardRecord | null> {
  const dbUser = await ensureUser(clerkId)

  const source = await db.characterCard.findUnique({
    where: { id: cardId },
    include: { ...CHARACTER_LOOKS_INCLUDE, loraLinks: true },
  })
  if (!source || source.userId !== dbUser.id || source.isDeleted) return null

  const count = await db.characterCard.count({
    where: { ...ownedBy(dbUser.id), isDeleted: false },
  })
  if (count >= CHARACTER_CARD.MAX_CARDS_PER_USER) {
    throw new Error(
      `Maximum ${CHARACTER_CARD.MAX_CARDS_PER_USER} character cards allowed`,
    )
  }

  const card = await db.$transaction(async (tx) => {
    const created = await tx.characterCard.create({
      data: {
        userId: dbUser.id,
        handle: await allocateHandleForNewCard(
          tx,
          dbUser.id,
          deriveCardHandleBase(name),
        ),
        name,
        summary: source.summary,
        tags: source.tags,
        ...serializeCharacterCardV2Fields({
          persona: mapCharacterCardRow(source).persona,
        }),
        extensions: mergeCardExtensions(source.extensions, {
          [TAVERN_CARD.EXTENSION_KEY]: null,
        }),
      },
    })
    const lookIds = new Map<string, string>()
    for (const [index, look] of source.looks.entries()) {
      const copy = await tx.characterLook.create({
        data: {
          characterCardId: created.id,
          label: look.label,
          isDefault: look.isDefault,
          description: look.description,
          tags: look.tags,
          referenceSlots: look.referenceSlots ?? [],
          sortOrder: index,
        },
      })
      lookIds.set(look.id, copy.id)
    }
    if (source.loraLinks.length)
      await tx.characterCardLora.createMany({
        data: source.loraLinks.map((link) => ({
          characterCardId: created.id,
          loraAssetId: link.loraAssetId,
          lookId: link.lookId ? (lookIds.get(link.lookId) ?? null) : null,
        })),
      })
    return tx.characterCard.findUniqueOrThrow({
      where: { id: created.id },
      include: CHARACTER_LOOKS_INCLUDE,
    })
  })

  return mapCharacterCardRow(card)
}
