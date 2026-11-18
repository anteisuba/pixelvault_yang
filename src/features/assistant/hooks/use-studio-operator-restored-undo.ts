'use client'

/**
 * **跨页面撤销**的按钮那一侧（11-17）：载回来的只读历史里，提示词 / 负面词那几行若本机还
 * 留着撤销本钱（`lib/studio-operator-undo-stash.ts`），就给一颗「撤销」。
 *
 * ⭐ 选定的语义（11-17 写死，测试锁着）：
 * - 那一格此刻**还是助手写下的那一版** → 写回原文，落一行 `revertField`（助手读得到）。
 * - 之后**又被改过**（手改 / 别的轮）→ ⛔ 不盖现在的字；原文复制进剪贴板，落一行
 *   `restoredUndoStale` 说清楚。理由：无论哪个方向盖，都有一段用户写的字被悄悄抹掉；
 *   拒绝 + 剪贴板是唯一两头都不丢的做法。
 *
 * ⚠ 只认当前宿主的表单（`apply.getState()`）：历史属于哪个工作台，撤销就落在哪个工作台；
 *   宿主换了（同一段会话在别的台上打开）比对那一步会自然不过 —— 走「复制原文」那一支。
 */

import { useCallback, useMemo, useState } from 'react'

import {
  appendOperatorEntry,
  nextOperatorEntryId,
} from '@/hooks/use-studio-operator-store'
import type { StudioOperatorApplyContext } from '@/lib/studio-operator-apply'
import {
  canRestoreOperatorUndo,
  dropOperatorUndoRecord,
  findOperatorUndoRecord,
  peekOperatorUndoStash,
  type OperatorUndoRecord,
} from '@/lib/studio-operator-undo-stash'
import { useStudioOperatorApplyContext } from './use-studio-operator-revert'

export type RestoredUndoOutcome = 'restored' | 'stale-copied' | 'stale-uncopied'

/** 纯判断 + 落表单：抽出来给单测（⛔ 不碰 React、不碰剪贴板）。 */
export function restoreOperatorUndoRecord(
  record: OperatorUndoRecord,
  ctx: {
    getState(): Pick<
      ReturnType<StudioOperatorApplyContext['getState']>,
      'prompt' | 'advancedParams'
    >
    dispatch: StudioOperatorApplyContext['dispatch']
  },
): boolean {
  const state = ctx.getState()
  const current =
    record.field === 'prompt'
      ? state.prompt
      : (state.advancedParams.negativePrompt ?? '')
  if (!canRestoreOperatorUndo(record, current)) return false
  if (record.field === 'prompt') {
    ctx.dispatch({ type: 'SET_PROMPT', payload: record.before })
  } else {
    ctx.dispatch({
      type: 'SET_ADVANCED_PARAMS',
      payload: { ...state.advancedParams, negativePrompt: record.before },
    })
  }
  return true
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (!globalThis.navigator?.clipboard) return false
    await globalThis.navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export interface UseStudioOperatorRestoredUndoResult {
  /** 历史里这一行还撤得了吗（对得上本机那一条）。 */
  recordFor(entryId: string, title: string): OperatorUndoRecord | null
  undo(record: OperatorUndoRecord): Promise<RestoredUndoOutcome>
}

export function useStudioOperatorRestoredUndo(
  sessionId: string | null,
): UseStudioOperatorRestoredUndoResult {
  const applyContext = useStudioOperatorApplyContext()
  // ⚠ 换会话（载回另一段历史）时重读：面板在壳里常驻，⛔ 只在挂上那一刻读一次 ——
  //   那一刻这段会话的撤销本钱可能还没落到本机。点撤销之后靠 `version` 再读。
  const [version, setVersion] = useState(0)
  const records = useMemo(
    () => (sessionId && version >= 0 ? peekOperatorUndoStash() : []),
    [sessionId, version],
  )

  const recordFor = useCallback(
    (entryId: string, title: string) =>
      findOperatorUndoRecord(records, sessionId, entryId, title),
    [records, sessionId],
  )

  const undo = useCallback(
    async (record: OperatorUndoRecord): Promise<RestoredUndoOutcome> => {
      const restored = restoreOperatorUndoRecord(record, applyContext)
      let outcome: RestoredUndoOutcome
      if (restored) {
        outcome = 'restored'
        appendOperatorEntry({
          kind: 'system',
          id: nextOperatorEntryId('sys'),
          code: 'revertField',
          subject: record.field,
        })
      } else {
        const copied = await copyText(record.before)
        outcome = copied ? 'stale-copied' : 'stale-uncopied'
        appendOperatorEntry({
          kind: 'system',
          id: nextOperatorEntryId('sys'),
          code: 'restoredUndoStale',
          subject: record.field,
          count: copied ? 1 : 0,
        })
      }
      // 两支都摘掉：撤回去了不该再撤一次；不盖的那一支原文已经交出去（剪贴板没成时
      // 留着，可以再点一次）。
      if (outcome !== 'stale-uncopied')
        dropOperatorUndoRecord(record, Date.now())
      setVersion((value) => value + 1)
      return outcome
    },
    [applyContext],
  )

  return { recordFor, undo }
}
