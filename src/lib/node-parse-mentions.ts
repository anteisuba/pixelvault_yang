/**
 * 正文里的 `@` 引用解析（spec §1.7）——**纯函数，无 React、无 DOM**。
 *
 * S0 只做「切成段」这一件事：把一行字切成 `text` 与 `mention` 交替的段，供
 * `MentionChip` 渲染。**把 mention 写进 `slots` 并建边是 S4**（`node-mentions-to-slots.ts`），
 * ⛔ 这里不碰图、不碰槽。
 *
 * ── 为什么要传 `names` ────────────────────────────────────────────────────
 * 画板上的引用名带空格（`@首帧 S02 站台图`），而普通正文里 `@莫宁 靠在长椅边`
 * 的空格是句子的一部分。纯语法分不开这两种，所以**已知名字表优先**（最长匹配）：
 * 引用的永远是画布上真实存在的节点，调用方拿得到这张表。拿不到时退回
 * 「空白/标点终止」的宽松档——⛔ 宁可少切一个 chip，也不要把半句话吞成名字。
 */

import {
  NODE_MENTION_ROLE_LABELS,
  type NodeMentionRole,
} from '@/constants/node-slots'
import { NODE_SLOT_IDS } from '@/constants/node-slots'

export interface MentionSegmentText {
  readonly type: 'text'
  readonly value: string
}

export interface MentionSegmentMention {
  readonly type: 'mention'
  /** 正文里的原串，含 `@` 与角色前缀——退格整体删除删的就是它。 */
  readonly raw: string
  /** 被引用的名字（不含 `@` 与角色前缀）。 */
  readonly name: string
  /** 显式写了前缀才有；无前缀 = `reference`（spec §8.2）。 */
  readonly role: NodeMentionRole
  /** 有没有显式写角色前缀——渲染 chip 时决定要不要显示前缀。 */
  readonly explicitRole: boolean
  /** 在原文里的起止（含头不含尾），供退格判定与光标计算。 */
  readonly start: number
  readonly end: number
}

export type MentionSegment = MentionSegmentText | MentionSegmentMention

export interface ParseMentionsOptions {
  /** 画布上真实存在的可引用名字。给了就走最长匹配。 */
  readonly names?: readonly string[]
}

/** 宽松档的终止符：空白与中英文断句标点。 */
const LOOSE_TERMINATORS = /[\s,.;:!?，。；：！？、）)】\]」』]/

export function parseMentions(
  text: string,
  options: ParseMentionsOptions = {},
): MentionSegment[] {
  const segments: MentionSegment[] = []
  // 长名优先：`莫宁` 与 `莫宁·独白` 同时存在时，短的先中会把长的切碎。
  const names = [...(options.names ?? [])].sort((a, b) => b.length - a.length)

  let cursor = 0
  let plainFrom = 0

  const flushPlain = (until: number) => {
    if (until > plainFrom) {
      segments.push({ type: 'text', value: text.slice(plainFrom, until) })
    }
  }

  while (cursor < text.length) {
    const at = text.indexOf('@', cursor)
    if (at === -1) break

    const parsed = parseOne(text, at, names)
    if (!parsed) {
      cursor = at + 1
      continue
    }
    flushPlain(at)
    segments.push(parsed)
    cursor = parsed.end
    plainFrom = parsed.end
  }

  flushPlain(text.length)
  return segments
}

function parseOne(
  text: string,
  at: number,
  names: readonly string[],
): MentionSegmentMention | null {
  let bodyStart = at + 1
  let role: NodeMentionRole = NODE_SLOT_IDS.reference
  let explicitRole = false

  for (const [label, labelRole] of Object.entries(NODE_MENTION_ROLE_LABELS)) {
    if (!text.startsWith(label, bodyStart)) continue
    // 前缀后必须跟一个空格才算前缀，否则 `@参考图3` 会被吃掉一半。
    if (text[bodyStart + label.length] !== ' ') continue
    role = labelRole
    explicitRole = true
    bodyStart += label.length + 1
    break
  }

  const name = matchName(text, bodyStart, names)
  if (!name) return null

  return {
    type: 'mention',
    raw: text.slice(at, bodyStart + name.length),
    name,
    role,
    explicitRole,
    start: at,
    end: bodyStart + name.length,
  }
}

function matchName(
  text: string,
  from: number,
  names: readonly string[],
): string | null {
  for (const candidate of names) {
    if (candidate.length > 0 && text.startsWith(candidate, from)) {
      return candidate
    }
  }
  if (names.length > 0) return null

  let end = from
  while (end < text.length && !LOOSE_TERMINATORS.test(text[end] ?? '')) end += 1
  return end > from ? text.slice(from, end) : null
}

/**
 * 退格整体删除（spec §1.7）：光标在某个 mention 的**尾部**时，返回要删掉的区间。
 * ⛔ 不在这里改字符串——文本状态归调用方（受控 input / 编辑器），这里只判位置。
 */
export function mentionDeletionRangeAt(
  text: string,
  caret: number,
  options: ParseMentionsOptions = {},
): { start: number; end: number } | null {
  const hit = parseMentions(text, options).find(
    (segment): segment is MentionSegmentMention =>
      segment.type === 'mention' && segment.end === caret,
  )
  return hit ? { start: hit.start, end: hit.end } : null
}
