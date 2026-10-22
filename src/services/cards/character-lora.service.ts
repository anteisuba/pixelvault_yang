import 'server-only'

import { characterCoverUrl } from '@/lib/card-bus'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { readCardTags } from '@/services/cards/character-card.mapper'
import { toLoraAssetRecord } from '@/services/lora-asset.service'
import { ensureUser } from '@/services/user.service'
import { CharacterReferenceSlotsSchema } from '@/types'
import type { CharacterLoraGroup } from '@/types'

/**
 * 角色收的 LoRA（角色③，2026-10-22）。契约见 `docs/references/domains/cards.md`
 * 「角色 ↔ LoRA」。
 *
 * ⭐ 角色只负责收集：只记「谁收了哪个」，权重 / 触发词都读 LoRA 本身。
 * ⭐ 只收自己名下的 LoRA（收藏与自训都是自己名下的一行）；别人公开的先收藏再加。
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
      extensions: true,
      referenceSlots: true,
      loraLinks: {
        orderBy: { createdAt: 'asc' },
        select: { loraAsset: true },
      },
    },
  })

  return cards.map((card) => {
    const slots = CharacterReferenceSlotsSchema.safeParse(card.referenceSlots)
    return {
      characterCardId: card.id,
      name: card.name,
      coverUrl: characterCoverUrl({
        referenceSlots: slots.success ? slots.data : [],
      }),
      appearanceTags: readCardTags(card.extensions).appearance,
      loras: card.loraLinks.map((link) =>
        toLoraAssetRecord(link.loraAsset, user.id),
      ),
    }
  })
}

/**
 * 这个 LoRA 属于哪些角色 —— 整组替换。LoRA 或任何一位角色不是自己的 → null（404）。
 * 返回替换后所有角色的分组，调用方直接换掉手上的那份。
 */
export async function setLoraCharacters(
  clerkId: string,
  loraAssetId: string,
  characterCardIds: readonly string[],
): Promise<CharacterLoraGroup[] | null> {
  const user = await ensureUser(clerkId)
  const wanted = [...new Set(characterCardIds)]

  const [asset, ownedCards] = await Promise.all([
    db.loraAsset.findFirst({
      where: { id: loraAssetId, userId: user.id },
      select: { id: true },
    }),
    wanted.length
      ? db.characterCard.count({
          where: { id: { in: wanted }, userId: user.id, isDeleted: false },
        })
      : Promise.resolve(0),
  ])
  if (!asset || ownedCards !== wanted.length) return null

  await db.$transaction([
    db.characterCardLora.deleteMany({
      where: { loraAssetId, characterCardId: { notIn: wanted } },
    }),
    db.characterCardLora.createMany({
      data: wanted.map((characterCardId) => ({ characterCardId, loraAssetId })),
      skipDuplicates: true,
    }),
  ])

  logger.info('LoRA characters set', {
    userId: user.id,
    loraAssetId,
    characters: wanted.length,
  })
  return listCharacterLoraGroups(clerkId)
}
