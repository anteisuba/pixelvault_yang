import 'server-only'

import { slotsCoverUrl } from '@/lib/card-bus'
import { db } from '@/lib/db'
import { ApiRequestError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import {
  CHARACTER_LOOKS_INCLUDE,
  readReferenceSlots,
} from '@/services/cards/character-card.mapper'
import {
  toLoraAssetRecord,
  upsertImportedLora,
} from '@/services/lora-asset.service'
import { ensureUser } from '@/services/user.service'
import type {
  CharacterLoraGroup,
  FavoriteLoraRequest,
  SetLoraCharactersRequest,
} from '@/types'

/**
 * 角色收的 LoRA（角色③，2026-10-22）。契约见 `docs/references/domains/cards.md`
 * 「角色 ↔ LoRA」。
 *
 * ⭐ 角色只负责收集：只记「谁收了哪个」，权重 / 触发词都读 LoRA 本身。
 * ⭐ 关联挂在你名下的那一行上：收藏 / 自训的直接用；没收藏的外部 LoRA 加到角色时
 *   记一行但不进库（`LoraAsset.inLibrary = false`），取消收藏也不会把它从角色里拿掉。
 */

/**
 * 每个角色一组（没收 LoRA 的角色也在，`loras` 为空）：LoRA 台「从角色选」只列有
 * LoRA 的；LoRA 库「加到角色…」要全部角色来勾。给 `characterCardId` 只取那一位。
 */
export async function listCharacterLoraGroups(
  clerkId: string,
  characterCardId?: string,
): Promise<CharacterLoraGroup[]> {
  const user = await ensureUser(clerkId)
  const cards = await db.characterCard.findMany({
    where: {
      userId: user.id,
      isDeleted: false,
      ...(characterCardId ? { id: characterCardId } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      looks: {
        ...CHARACTER_LOOKS_INCLUDE.looks,
        select: {
          id: true,
          label: true,
          isDefault: true,
          tags: true,
          referenceSlots: true,
        },
      },
      loraLinks: {
        orderBy: { createdAt: 'asc' },
        select: { loraAsset: true, lookId: true },
      },
    },
  })

  return cards.map((card) => ({
    characterCardId: card.id,
    name: card.name,
    coverUrl: slotsCoverUrl(readReferenceSlots(card.looks[0]?.referenceSlots)),
    looks: card.looks.map((look) => ({
      id: look.id,
      label: look.label,
      isDefault: look.isDefault,
      tags: look.tags,
    })),
    loras: card.loraLinks.map((link) => ({
      ...toLoraAssetRecord(link.loraAsset, user.id),
      lookId: link.lookId,
    })),
  }))
}

/**
 * 这个 LoRA 属于哪些角色 —— 整组替换，返回替换后所有角色的分组。
 *
 * 按 `loraUrl` 认你名下的那一行；没收藏的外部 LoRA 第一次加到角色时在你名下记
 * 一行但不进库（`inLibrary: false`，owner 2026-10-22「加到角色≠收藏」），全部勾掉
 * 时这一行随之删掉。有角色不是你的（或已删）→ 404，什么都不写。
 */
export async function setLoraCharacters(
  clerkId: string,
  lora: FavoriteLoraRequest,
  characters: SetLoraCharactersRequest['characters'],
): Promise<CharacterLoraGroup[]> {
  const user = await ensureUser(clerkId)
  const lookOf = new Map(
    characters.map((item) => [item.characterCardId, item.lookId]),
  )
  const wanted = [...lookOf.keys()]

  if (wanted.length > 0) {
    const ownedCards = await db.characterCard.findMany({
      where: { id: { in: wanted }, userId: user.id, isDeleted: false },
      select: { id: true, looks: { select: { id: true } } },
    })
    if (ownedCards.length !== wanted.length) throw characterNotFoundError()
    // 造型必须是她自己的。
    const lookMismatch = ownedCards.some((card) => {
      const lookId = lookOf.get(card.id)
      return lookId && !card.looks.some((look) => look.id === lookId)
    })
    if (lookMismatch) throw characterNotFoundError()
  }

  const existing = await db.loraAsset.findFirst({
    where: { userId: user.id, loraUrl: lora.loraUrl },
    select: { id: true, source: true, inLibrary: true },
  })
  if (!existing && wanted.length === 0) {
    return listCharacterLoraGroups(clerkId)
  }
  const asset =
    existing ?? (await upsertImportedLora(user.id, lora, { inLibrary: false }))

  await db.$transaction([
    db.characterCardLora.deleteMany({
      where: { loraAssetId: asset.id, characterCardId: { notIn: wanted } },
    }),
    ...wanted.map((characterCardId) =>
      db.characterCardLora.upsert({
        where: {
          characterCardId_loraAssetId: {
            characterCardId,
            loraAssetId: asset.id,
          },
        },
        create: {
          characterCardId,
          loraAssetId: asset.id,
          lookId: lookOf.get(characterCardId) ?? null,
        },
        update: { lookId: lookOf.get(characterCardId) ?? null },
      }),
    ),
  ])

  // 没收藏、也没有角色再收它了：这一行没有存在的理由。
  const orphaned =
    wanted.length === 0 && asset.source === 'imported' && !asset.inLibrary
  if (orphaned) await db.loraAsset.delete({ where: { id: asset.id } })

  logger.info('LoRA characters set', {
    userId: user.id,
    loraAssetId: asset.id,
    characters: wanted.length,
    created: !existing,
    removed: orphaned,
  })
  return listCharacterLoraGroups(clerkId)
}

function characterNotFoundError(): ApiRequestError {
  return new ApiRequestError(
    'NOT_FOUND',
    404,
    'errors.characterLora.notFound',
    'Character not found',
  )
}
