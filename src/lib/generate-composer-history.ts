import { NODE_STUDIO_GENERATE_COMPOSER } from '@/constants/node-studio'

/**
 * 生成提示词框 · 提示词历史 / 最近用过
 * （docs/references/pages/canvas-generate-composer.md §6）。
 *
 * 画布上会反复「改一版再改一版」，每次重打一遍很蠢——这个模块本身是个好东
 * 西，先别删。存储选 localStorage（不是 node.data / 项目状态）——这是一份
 * 跨节点、跨项目的「我最近打过的话」个人手记，不是任何一个节点的持久字段，
 * 也不需要服务端同步。纯函数 + 在函数体内做 `typeof window` 判空，在
 * SSR/测试环境下安全地退化成空历史，不抛错。
 *
 * ⚠ 现状（2026-07-27）：composer 自建的「扩大 = modal + 这条 chip 行」已经
 * 退役（§6 修订——扩大改成打开宿主节点详情页，详情页与 composer 自建 modal
 * 功能重叠）。`pushComposerHistory` 仍然被 `use-generate-composer.ts` 的
 * `send()` 调用，写入没停；`readComposerHistory` 暂时没有消费者——读端落点
 * 挪到重设计后的节点详情页（那一轮尚未开始，见 canvas-generate-composer.md
 * §6「⬜ 节点详情页需要重新设计」）。到时候直接读这个模块，不要重新发明存储。
 */

const STORAGE_KEY = 'pixelvault:canvas:generate-composer:history:v1'

export interface ComposerHistoryEntry {
  prompt: string
  /** epoch ms — only used to keep "most recent first" ordering stable. */
  ts: number
}

function isHistoryEntry(value: unknown): value is ComposerHistoryEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ComposerHistoryEntry).prompt === 'string' &&
    typeof (value as ComposerHistoryEntry).ts === 'number'
  )
}

function readRaw(): ComposerHistoryEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isHistoryEntry)
  } catch {
    // Malformed JSON / storage disabled — history is a nicety, never throw.
    return []
  }
}

/** Most-recent-first list, capped at `historyMaxEntries`. */
export function readComposerHistory(): ComposerHistoryEntry[] {
  return readRaw().slice(0, NODE_STUDIO_GENERATE_COMPOSER.historyMaxEntries)
}

/**
 * Records a sent prompt. De-dupes by exact text (a repeat send bumps the
 * existing entry to the front instead of listing it twice) and caps the
 * list. Returns the updated list so callers can render it immediately
 * without a second read.
 */
export function pushComposerHistory(prompt: string): ComposerHistoryEntry[] {
  const trimmed = prompt.trim()
  if (!trimmed) return readComposerHistory()

  const existing = readRaw().filter((entry) => entry.prompt !== trimmed)
  const next = [{ prompt: trimmed, ts: Date.now() }, ...existing].slice(
    0,
    NODE_STUDIO_GENERATE_COMPOSER.historyMaxEntries,
  )

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Storage full / disabled — never block send over a history write.
    }
  }

  return next
}
