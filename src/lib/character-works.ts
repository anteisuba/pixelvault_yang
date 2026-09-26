import { CHARACTER_WORK_NAMES } from '@/constants/cards'
import type { CharacterCardRecord } from '@/types'

/**
 * 角色属于哪部作品（角色页按作品分组，owner 09-26）。
 *
 * 顺序：手改值（`workOverride`）→ 第一个角色标签括号里的 copyright 标签 → 原创。
 * ⚠ 分组按**显示名**认：手写「鸣潮」和标签取出的「鸣潮」是同一组。
 */

export type CharacterWorkSource = 'override' | 'tag' | 'original'

export interface CharacterWork {
  /** 分组键：显示名；原创为 null（由调用方翻译成「原创」）。 */
  label: string | null
  source: CharacterWorkSource
  /** 从标签取出来的 copyright 标签（编辑里提示「从标签取」用）。 */
  tag: string | null
}

type WorkLocale = keyof (typeof CHARACTER_WORK_NAMES)[string]

/** `denia_(wuthering_waves)` → `wuthering_waves`；最后一组括号才是作品。 */
export function workTagFromCharacterTag(tag: string): string | null {
  const match = /\(([^()]+)\)\s*$/.exec(tag.trim())
  return match ? match[1]!.trim().toLowerCase() : null
}

/** 表里没有的作品：把标签还原成词（`zenless_zone_zero` → `Zenless Zone Zero`）。 */
function humanizeWorkTag(tag: string): string {
  return tag
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function workLabelFromTag(tag: string, locale: string): string {
  const names = CHARACTER_WORK_NAMES[tag]
  if (!names) return humanizeWorkTag(tag)
  const key: WorkLocale = locale === 'ja' || locale === 'en' ? locale : 'zh'
  return names[key]
}

export function characterWork(
  card: Pick<CharacterCardRecord, 'workOverride' | 'cardTags'>,
  locale: string,
): CharacterWork {
  const tag =
    card.cardTags.character
      .map(workTagFromCharacterTag)
      .find((value): value is string => value !== null) ?? null
  if (card.workOverride)
    return { label: card.workOverride, source: 'override', tag }
  if (tag) return { label: workLabelFromTag(tag, locale), source: 'tag', tag }
  return { label: null, source: 'original', tag: null }
}

/** 一个角色的张数 = 卡上的图 + 用她出过的图（owner 09-26）。 */
export function characterImageCount(
  card: Pick<CharacterCardRecord, 'referenceSlots' | 'generationCount'>,
): number {
  return card.referenceSlots.length + card.generationCount
}
