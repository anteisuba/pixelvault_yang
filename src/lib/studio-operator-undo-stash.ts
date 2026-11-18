/**
 * **跨页面撤销**的本机那一份（11-17 真机：助手用 edit 把图片台 1000 多字的提示词整段换掉，
 * 离开页面再回来「撤销」没了，原草稿无处可找）。
 *
 * ── 为什么不是会话历史 ──────────────────────────────────────────────
 * 会话历史（`studio-operator-history.ts`）在结构上装不下 `inverse`，理由是「重新加载之后
 * 表单早就不是当时那张，过期的撤销只会做错事」。这条理由对，所以这里**不复活 inverse**，
 * 只落两样东西：那一格改之前的原文（`before`）与助手写下的那一版（`after`）。撤销前比对：
 * 那一格此刻还是 `after` 才写回 `before`；之后被手改过就 ⛔ 不盖，原文交给剪贴板。
 * 于是「过期的撤销做错事」在这里不可能发生，原草稿也丢不了。
 *
 * ── 落法与续跑（`studio-operator-resume.ts`）同一套 ─────────────────
 * localStorage、Zod 先过再写、读不动整条丢、写不进去不抛、时钟由调用方给。
 * 只收提示词 / 负面词两格（长文才是丢了就没了的那一样）；条数 / 字数 / 保质期见
 * `STUDIO_OPERATOR_UNDO_STASH`，超了先丢旧的，长草稿最后丢。
 *
 * ⚠ 认人按「会话 id + 条目 id + 标题」：条目 id 是每次页面加载现编的序号（`run-3:s1`），
 *   同一段会话跨几次加载会撞号 —— 撞上时取最新那条，比对那一步兜住认错的情况。
 */

import { z } from 'zod'

import {
  ASSISTANT_OPERATOR_LIMITS,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
  ASSISTANT_OPERATOR_TOOL_IDS,
} from '@/constants/assistant-operator'
import { STUDIO_OPERATOR_UNDO_STASH as STASH } from '@/constants/studio-assistant-operator'
import { operatorWrittenText } from '@/lib/studio-operator-apply'
import type { StudioOperatorThreadEntry } from '@/types/studio-assistant-operator'

const UNDO_FIELDS = ['prompt', 'negative'] as const
export type OperatorUndoField = (typeof UNDO_FIELDS)[number]

const TextSchema = z.string().max(STASH.maxTextChars)

export const OperatorUndoRecordSchema = z.object({
  sessionId: z.string().min(1).max(200),
  entryId: z.string().min(1).max(400),
  /** 那一步的标题（历史行上同一个字）：撞号时帮着认。 */
  title: z.string().max(400),
  field: z.enum(UNDO_FIELDS),
  before: TextSchema,
  after: TextSchema,
  /** ISO 时刻：保质期与「先丢旧的」都按它。 */
  at: z.string().min(1).max(40),
  /** 原文够长（`draftMinChars`）= 多半是没存下来的草稿，最后才丢。 */
  draft: z.boolean(),
})
export type OperatorUndoRecord = z.infer<typeof OperatorUndoRecordSchema>

const StashSchema = z.array(OperatorUndoRecordSchema).max(STASH.maxRecords)

function historyTitle(title: string): string {
  return title.slice(0, ASSISTANT_OPERATOR_LIMITS.maxTitleChars).trim()
}

function sameRecord(a: OperatorUndoRecord, b: OperatorUndoRecord): boolean {
  return (
    a.sessionId === b.sessionId &&
    a.entryId === b.entryId &&
    a.title === b.title &&
    a.field === b.field &&
    a.before === b.before &&
    a.after === b.after
  )
}

/**
 * 这一份线程里，哪几步是可以跨页面撤销的写字：做完了、没撤、写的是提示词 / 负面词。
 * 返回 `{ record, undone }`：撤过的那几条要从本机那份里摘掉。
 */
export function collectOperatorUndoRecords(
  sessionId: string,
  entries: readonly StudioOperatorThreadEntry[],
  now: number,
): { record: OperatorUndoRecord; undone: boolean }[] {
  const at = new Date(now).toISOString()
  return entries.flatMap((entry) => {
    if (entry.kind !== 'step') return []
    const step = entry.step
    if (step.status !== ASSISTANT_OPERATOR_STEP_STATUS_IDS.done) return []
    let field: OperatorUndoField
    let before: string
    let after: string
    if (step.tool === ASSISTANT_OPERATOR_TOOL_IDS.setPrompt) {
      field = 'prompt'
      before = step.inverse.value
      after = operatorWrittenText(before, step.payload)
    } else if (step.tool === ASSISTANT_OPERATOR_TOOL_IDS.setNegative) {
      field = 'negative'
      before = step.inverse.value
      after = operatorWrittenText(before, step.payload)
    } else {
      return []
    }
    // ⚠ 太长的不截：截过的原文撤回去就是坏的，宁可不收。
    if (before.length > STASH.maxTextChars || after.length > STASH.maxTextChars)
      return []
    if (before === after) return []
    return [
      {
        record: {
          sessionId,
          entryId: entry.id,
          // ⚠ 与历史那一行同一个截法（`toOperatorHistory` 截到 maxTitleChars、schema 再 trim），
          //   否则长标题那一步刷新回来永远对不上号。
          title: historyTitle(step.title),
          field,
          before,
          after,
          at,
          draft: before.trim().length >= STASH.draftMinChars,
        },
        undone: entry.undone,
      },
    ]
  })
}

/**
 * 收拾：过期的丢掉；条数 / 总字数超了先丢旧的普通改动，再丢旧的长草稿。
 * 返回值按时间从旧到新。
 */
export function pruneOperatorUndoRecords(
  records: readonly OperatorUndoRecord[],
  now: number,
): OperatorUndoRecord[] {
  const fresh = records
    .filter((record) => {
      const at = Date.parse(record.at)
      return Number.isFinite(at) && now - at <= STASH.ttlMs
    })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  const size = (list: readonly OperatorUndoRecord[]) =>
    list.reduce(
      (sum, record) => sum + record.before.length + record.after.length,
      0,
    )
  const kept = [...fresh]
  while (kept.length > STASH.maxRecords || size(kept) > STASH.maxTotalChars) {
    const victim = kept.findIndex((record) => !record.draft)
    kept.splice(victim === -1 ? 0 : victim, 1)
  }
  return kept
}

function readRaw(): OperatorUndoRecord[] {
  let raw: string | null = null
  try {
    raw = globalThis.localStorage?.getItem(STASH.storageKey) ?? null
  } catch {
    return []
  }
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  const result = StashSchema.safeParse(parsed)
  return result.success ? result.data : []
}

function writeRaw(records: readonly OperatorUndoRecord[]): void {
  const parsed = StashSchema.safeParse(records)
  if (!parsed.success) return
  try {
    if (parsed.data.length === 0)
      globalThis.localStorage?.removeItem(STASH.storageKey)
    else
      globalThis.localStorage?.setItem(
        STASH.storageKey,
        JSON.stringify(parsed.data),
      )
  } catch {
    // 无痕模式 / 配额满：撤销兜底是锦上添花，⛔ 不许把保存会话那一跳掀翻。
  }
}

/**
 * 本机那一份，不按时钟收拾（渲染里读用：React 渲染里⛔ 取时钟）。过期的那几条下一次写入时就丢了；
 * 撤销钮多亮几分钟无害 —— 点下去照样先比对。
 */
export function peekOperatorUndoStash(): OperatorUndoRecord[] {
  return readRaw()
}

/** 本机那一份（已过期的不算）。 */
export function readOperatorUndoStash(now: number): OperatorUndoRecord[] {
  return pruneOperatorUndoRecords(readRaw(), now)
}

/**
 * 会话存进库之后调（那一刻会话 id 才定下来）：把这一段线程里可撤的写字落到本机，
 * 这一次页面加载里已经撤过的摘掉。
 */
export function syncOperatorUndoStash(
  sessionId: string,
  entries: readonly StudioOperatorThreadEntry[],
  now: number,
): void {
  const collected = collectOperatorUndoRecords(sessionId, entries, now)
  if (collected.length === 0) return
  const existing = readRaw()
  const next = existing.filter(
    (record) => !collected.some((item) => sameRecord(item.record, record)),
  )
  for (const item of collected) {
    if (item.undone) continue
    // 已经在的那条保留原时刻（⛔ 每存一次会话就把它挪成「最新」）。
    const before = existing.find((record) => sameRecord(record, item.record))
    next.push(before ?? item.record)
  }
  writeRaw(pruneOperatorUndoRecords(next, now))
}

/** 历史里这一行对得上哪一条（撞号时取最新的）；对不上 = `null`。 */
export function findOperatorUndoRecord(
  records: readonly OperatorUndoRecord[],
  sessionId: string | null,
  entryId: string,
  title: string,
): OperatorUndoRecord | null {
  if (!sessionId) return null
  return (
    records.findLast(
      (record) =>
        record.sessionId === sessionId &&
        record.entryId === entryId &&
        record.title === historyTitle(title),
    ) ?? null
  )
}

/** 撤过了（或用户放弃了）：从本机那份里摘掉这一条。 */
export function dropOperatorUndoRecord(
  target: OperatorUndoRecord,
  now: number,
): void {
  writeRaw(
    pruneOperatorUndoRecords(
      readRaw().filter((record) => !sameRecord(record, target)),
      now,
    ),
  )
}

/**
 * 撤之前比对（选定的语义，11-17）：那一格此刻还是助手写下的那一版 → 可以写回原文；
 * 之后又被改过 → ⛔ 不盖（原文交给调用方放进剪贴板）。前后空白不算改过。
 */
export function canRestoreOperatorUndo(
  record: OperatorUndoRecord,
  current: string,
): boolean {
  return current.trim() === record.after.trim()
}
