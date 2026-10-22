/**
 * 卡片总线 v3 的纯函数（进度表 35 · 第 ② 片）。
 *
 * 全部不碰库：同图比较键；handle 分配；正文里 `@handle` 的最长匹配。
 * 写方与编译总线都从这里取，⛔ 别在调用方各写一份。
 * 契约见 `docs/references/domains/cards.md`「卡片总线 v3 契约」。
 */

import { CHARACTER_CARD } from '@/constants/cards/character-card'
import type { CharacterLookRecord, CharacterReferenceSlot } from '@/types'

// ─── 造型（角色④）─────────────────────────────────────────────────

const EMPTY_LOOK: CharacterLookRecord = {
  id: '',
  label: null,
  isDefault: true,
  description: null,
  tags: [],
  referenceSlots: [],
}

/** 默认造型；读到的卡一套造型都没有（不该发生）时给一套空的，⛔ 不让页面失败。 */
export function defaultLook(card: {
  looks: readonly CharacterLookRecord[]
}): CharacterLookRecord {
  return (
    card.looks.find((look) => look.isDefault) ?? card.looks[0] ?? EMPTY_LOOK
  )
}

/** 按 id 找造型；没给或认不出就用默认造型。 */
export function findLook(
  card: { looks: readonly CharacterLookRecord[] },
  lookId: string | null | undefined,
): CharacterLookRecord {
  return (
    (lookId && card.looks.find((look) => look.id === lookId)) ||
    defaultLook(card)
  )
}

/** 角色全部造型的图（默认造型在前）：张数、「卡上的图」都按这个算。 */
export function allLookSlots(card: {
  looks: readonly CharacterLookRecord[]
}): CharacterReferenceSlot[] {
  return card.looks.flatMap((look) => look.referenceSlots)
}

// ─── 同一张图 ─────────────────────────────────────────────────────

/** 一组参考槽的封面：主图那一槽，没有主图取第一槽；一张图都没有 = `null`。 */
export function slotsCoverUrl(
  slots: readonly CharacterReferenceSlot[],
): string | null {
  return slots.find((slot) => slot.isPrimary)?.url ?? slots[0]?.url ?? null
}

/** 角色封面 = 默认造型的封面。 */
export function characterCoverUrl(card: {
  looks: readonly CharacterLookRecord[]
}): string | null {
  return slotsCoverUrl(defaultLook(card).referenceSlots)
}

/**
 * 同一张图的比较键：只看路径。旧卡上同一张图常以两个域名出现（自有 CDN 与旧的
 * `r2.dev` 公链，存储键相同），按整串比会当成两张、白占一个参考名额。
 */
export function referenceUrlKey(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname)
  } catch {
    return url.trim()
  }
}

// ─── handle ──────────────────────────────────────────────────────

/**
 * 比较 handle 用的键：NFKC 归一 + ASCII 小写。全角 `ＬＩＮ` 与 `lin`、
 * `Shiye` 与 `shiye` 算同一个；中日文原样（它们没有大小写）。
 */
export function cardHandleKey(handle: string): string {
  return handle.normalize('NFKC').replace(/[A-Z]/g, (c) => c.toLowerCase())
}

const HANDLE_FALLBACK = 'card'

/**
 * 从展示名派生 handle 的底子：NFKC → 空白换成 `-` → 去掉不允许的字符 →
 * 去掉开头的 `-` / `_` → 截到上限。什么都不剩就用 `card`。
 */
export function deriveCardHandleBase(name: string): string {
  const cleaned = name
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .replace(/^[-_]+/, '')
    .replace(/-{2,}/g, '-')
  return (
    [...cleaned].slice(0, CHARACTER_CARD.HANDLE_MAX_LENGTH).join('') ||
    HANDLE_FALLBACK
  )
}

/**
 * 在「已占用」里给一个底子分配 handle：不冲突就原样用，冲突就依次加 `-2`、`-3`……
 * 分配到的那个会**写进 `taken`**（调用方按确定性顺序逐张调用即可）。
 * ⚠ `taken` 存的是 `cardHandleKey`，不是原串。
 */
export function allocateCardHandle(base: string, taken: Set<string>): string {
  for (let n = 1; ; n += 1) {
    const suffix = n === 1 ? '' : `-${n}`
    const head = [...base]
      .slice(0, CHARACTER_CARD.HANDLE_MAX_LENGTH - suffix.length)
      .join('')
    const handle = `${head}${suffix}`
    const key = cardHandleKey(handle)
    if (!taken.has(key)) {
      taken.add(key)
      return handle
    }
  }
}

// ─── `@handle` 最长匹配 ──────────────────────────────────────────

export interface CardHandleMention {
  /** 命中的那个已知 handle（原样）。 */
  handle: string
  /** `@` 在正文里的下标。 */
  index: number
  /** 含 `@` 在内的长度。 */
  length: number
}

/**
 * 在正文里找出所有 `@已知handle`，**最长匹配**：`@林夏-雨夜走进来` 在同时认得
 * `林夏` 与 `林夏-雨夜` 时取后者；`@林夏走进来` 只认得 `林夏` 时取 `林夏`。
 *
 * ⛔ 不用 `\b\w+\b` 切词：中文没有词边界，那样一个都切不出来。
 * ⚠ 比较走 `cardHandleKey`（NFKC + ASCII 小写）；不认得的 `@xxx` 原样跳过。
 */
export function findCardHandleMentions(
  text: string,
  knownHandles: readonly string[],
): CardHandleMention[] {
  const known = [...new Set(knownHandles)]
    .filter(Boolean)
    .map((handle) => ({ handle, key: cardHandleKey(handle) }))
    .sort((a, b) => b.handle.length - a.handle.length)
  const mentions: CardHandleMention[] = []
  let cursor = 0
  while (cursor < text.length) {
    const at = text.indexOf('@', cursor)
    if (at === -1) break
    const hit = known.find(
      ({ handle, key }) =>
        cardHandleKey(text.slice(at + 1, at + 1 + handle.length)) === key,
    )
    if (hit) {
      mentions.push({
        handle: hit.handle,
        index: at,
        length: hit.handle.length + 1,
      })
      cursor = at + 1 + hit.handle.length
    } else {
      cursor = at + 1
    }
  }
  return mentions
}
