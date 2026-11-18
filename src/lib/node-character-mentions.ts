/**
 * 画布卡提示词里的 **@她**（画布用角色 ④ 第 2 片，owner 09-28）—— 纯函数。
 *
 * ⭐ 她在不在这一镜 = 正文里有没有 `@她`（名字对角色库）；不建边、不进槽。
 * ⭐ 带哪几张 = 卡上 `characterPicks[她的 id]`；没勾过 = 主图 1 张。
 * 参考轨上的那一格（`CharacterMentionRail`）与出图装配（`planV4Generation`）读的是
 * 同一份，⛔ 不各自认一遍。
 */

import { parseMentions } from '@/lib/node-parse-mentions'
import type { CharacterCardRecord, CharacterImagePick } from '@/types'
import { defaultLook } from '@/lib/card-bus'

export interface NodeCharacterMention {
  readonly card: CharacterCardRecord
  readonly picks: readonly CharacterImagePick[]
}

/**
 * 没勾过 = 默认造型的主图 1 张（与工作台第一次展开默认勾主图同一条）。没有槽 = 空
 * （交给卡片总线）。
 */
export function defaultCharacterPicks(
  card: CharacterCardRecord,
): CharacterImagePick[] {
  const slots = defaultLook(card).referenceSlots
  const primary = slots.find((slot) => slot.isPrimary) ?? slots[0]
  return primary ? [{ slotId: primary.id }] : []
}

/**
 * 这几张挑的图属于哪套造型（11-17 画布选造型）：认第一张**卡上的**图所在那套；默认造型 /
 * 只挑了「用她出的」/ 认不出 = `null`（服务端用默认造型）。
 *
 * ⭐ 造型不另存一份：画布节点只存 `characterPicks`，挑了哪套的图就是用哪套 —— 服务端按
 *   `characterLookIds` 在**那一套**的参考槽里认槽 id（`loadCardBusCharacters`），文字
 *   （外观 / 标签）也换成那套的。
 */
export function lookIdOfPicks(
  card: CharacterCardRecord,
  picks: readonly CharacterImagePick[],
): string | null {
  for (const pick of picks) {
    if (!('slotId' in pick)) continue
    const look = card.looks.find((item) =>
      item.referenceSlots.some((slot) => slot.id === pick.slotId),
    )
    if (look) return look.isDefault ? null : look.id
  }
  return null
}

/** 那套造型的主图 1 张（没有图 = 空）。 */
export function lookPrimaryPicks(
  card: CharacterCardRecord,
  lookId: string | null,
): CharacterImagePick[] {
  const look =
    (lookId && card.looks.find((item) => item.id === lookId)) ||
    defaultLook(card)
  const primary =
    look.referenceSlots.find((slot) => slot.isPrimary) ?? look.referenceSlots[0]
  return primary ? [{ slotId: primary.id }] : []
}

/** 正文里 @ 了角色库里的哪几位（按出场先后、去重；同名的只认第一位）。 */
export function mentionedCharacters(
  prompt: string,
  cards: readonly CharacterCardRecord[],
  characterPicks: Readonly<Record<string, readonly CharacterImagePick[]>> = {},
): NodeCharacterMention[] {
  if (!prompt.includes('@') || cards.length === 0) return []
  const segments = parseMentions(prompt, {
    names: cards.map((card) => card.name),
  })
  const seen = new Set<string>()
  const out: NodeCharacterMention[] = []
  for (const segment of segments) {
    if (segment.type !== 'mention') continue
    const card = cards.find((item) => item.name === segment.name)
    if (!card || seen.has(card.id)) continue
    seen.add(card.id)
    out.push({
      card,
      picks: characterPicks[card.id] ?? defaultCharacterPicks(card),
    })
  }
  return out
}

/**
 * 发给模型的正文里把 `@她` 写回 `她`：`@` 是画布上的引用记号，模型看见只会当成字面的
 * 「@」。⚠ 只动角色名前的 `@`，节点 / 参考轨的 `@图1` 另有去处，⛔ 不碰。
 */
export function stripCharacterMentionMarks(
  prompt: string,
  mentions: readonly NodeCharacterMention[],
): string {
  let out = prompt
  for (const { card } of mentions) {
    out = out.split(`@${card.name}`).join(card.name)
  }
  return out
}
