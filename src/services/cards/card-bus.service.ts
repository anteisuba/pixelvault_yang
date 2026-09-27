import 'server-only'

import { deriveCardHandleBase } from '@/lib/card-bus'
import {
  toCardBusCharacter,
  type CardBusCharacter,
} from '@/lib/card-bus-compile'
import { db } from '@/lib/db'
import { referenceSlotsFromCardRow } from '@/services/cards/character-card.mapper'
import {
  CharacterReferenceSlotsSchema,
  type CharacterImagePick,
  type CharacterReferenceSlot,
} from '@/types'

/**
 * **卡片总线唯一的读卡入口**（进度表 35 · 第 ⑤ 片）：按 id 读一组角色卡，产出
 * 中间形态（`CardBusCharacter[]`），顺序与传进来的 id 一致（第一个 = 焦点角色）。
 *
 * ⚠ 只认本人、未删的卡；读不到的 id 静默略过（卡在别处被删了不该让出图失败）。
 * ⚠ 参考槽以 `referenceSlots` 为准；expand 期它万一坏了或还空着，就从旧的四列
 *   现算一份（与回填、双写同一个函数），⛔ 不在这里另写一套转换。
 */
export async function loadCardBusCharacters(
  userId: string,
  cardIds: readonly string[],
  /**
   * 工作台上**挑了哪几张**（owner 09-27）：有挑的角色只送这几张、按挑的顺序；
   * 卡上的图按槽 id 认，「用她出的」按生成记录 id 认（只认本人的图片生成）。
   * 挑的全都认不出时退回自动排，⛔ 不让这个角色一张图都不带。
   */
  picks?: Readonly<Record<string, readonly CharacterImagePick[]>>,
): Promise<CardBusCharacter[]> {
  const ids = [...new Set(cardIds)]
  if (ids.length === 0) return []
  const rows = await db.characterCard.findMany({
    where: { id: { in: ids }, userId, isDeleted: false },
    select: {
      id: true,
      version: true,
      handle: true,
      name: true,
      characterPrompt: true,
      description: true,
      extensions: true,
      referenceSlots: true,
      sourceImageUrl: true,
      sourceImages: true,
      sourceImageEntries: true,
      referenceImages: true,
      referenceRoles: true,
    },
  })
  const byId = new Map(rows.map((row) => [row.id, row]))
  const pickedGenerationIds = [
    ...new Set(
      ids.flatMap((id) =>
        (picks?.[id] ?? []).flatMap((pick) =>
          'generationId' in pick ? [pick.generationId] : [],
        ),
      ),
    ),
  ]
  const generationUrls = pickedGenerationIds.length
    ? new Map(
        (
          await db.generation.findMany({
            where: {
              id: { in: pickedGenerationIds },
              userId,
              outputType: 'IMAGE',
            },
            select: { id: true, url: true },
          })
        ).map((row) => [row.id, row.url]),
      )
    : new Map<string, string>()
  return ids.flatMap((id) => {
    const row = byId.get(id)
    if (!row) return []
    const stored = CharacterReferenceSlotsSchema.safeParse(row.referenceSlots)
    const derived = stored.success
      ? stored
      : CharacterReferenceSlotsSchema.safeParse(referenceSlotsFromCardRow(row))
    // 两份都不成立（主图地址都没有）时这张卡只进文字，⛔ 不让出图失败。
    const cardSlots = derived.success ? derived.data : []
    const chosen = pickedSlots(picks?.[id], cardSlots, generationUrls)
    const slots = chosen.length ? chosen : cardSlots
    return [
      toCardBusCharacter({
        id: row.id,
        version: row.version,
        handle: row.handle ?? deriveCardHandleBase(row.name),
        name: row.name,
        characterPrompt: row.characterPrompt,
        description: row.description,
        extensions: row.extensions,
        slots,
        ...(chosen.length ? { keepOrder: true } : {}),
      }),
    ]
  })
}

/** 挑的那几张 → 参考槽（按挑的顺序）；认不出的略过。 */
function pickedSlots(
  picks: readonly CharacterImagePick[] | undefined,
  cardSlots: readonly CharacterReferenceSlot[],
  generationUrls: ReadonlyMap<string, string>,
): CharacterReferenceSlot[] {
  if (!picks?.length) return []
  return picks.flatMap((pick): CharacterReferenceSlot[] => {
    if ('slotId' in pick) {
      const slot = cardSlots.find((item) => item.id === pick.slotId)
      return slot ? [slot] : []
    }
    const url = generationUrls.get(pick.generationId)
    return url
      ? [
          {
            id: `generation:${pick.generationId}`,
            role: 'identity',
            url,
            isPrimary: false,
            origin: 'generation',
            generationId: pick.generationId,
          },
        ]
      : []
  })
}
