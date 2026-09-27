/**
 * 画布卡提示词里的 **@她**（画布用角色 ④ 第 2 片，owner 09-28）—— 纯函数。
 *
 * ⭐ 她在不在这一镜 = 正文里有没有 `@她`（名字对角色库）；不建边、不进槽。
 * ⭐ 带哪几张 = 卡上 `characterPicks[她的 id]`；没勾过 = 主图 1 张。
 * 参考轨上的那一格（`CharacterMentionRail`）与出图装配（`planV4Generation`）读的是
 * 同一份，⛔ 不各自认一遍。
 */

import { parseMentions } from '@/components/business/node/nodes/v4/chrome/parse-mentions'
import type { CharacterCardRecord, CharacterImagePick } from '@/types'

export interface NodeCharacterMention {
  readonly card: CharacterCardRecord
  readonly picks: readonly CharacterImagePick[]
}

/** 她的主图：主图槽 → 第一张槽 → 建卡时的源图。 */
export function characterMainImage(card: CharacterCardRecord) {
  return (
    card.referenceSlots.find((slot) => slot.isPrimary)?.url ??
    card.referenceSlots[0]?.url ??
    card.sourceImageUrl ??
    undefined
  )
}

/** 没勾过 = 主图 1 张（与工作台第一次展开默认勾主图同一条）。没有槽 = 空（交给卡片总线）。 */
export function defaultCharacterPicks(
  card: CharacterCardRecord,
): CharacterImagePick[] {
  const primary =
    card.referenceSlots.find((slot) => slot.isPrimary) ?? card.referenceSlots[0]
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
