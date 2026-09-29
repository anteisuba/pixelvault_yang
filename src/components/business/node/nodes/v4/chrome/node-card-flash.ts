/**
 * **卡面闪一下**（spec §1.13 尾句「连完目标卡短暂高亮并滚到可见」；方向 B：与助手
 * 改卡同一种 —— 墨色外圈 2px 亮一下 320，只闪卡面）。
 *
 * 「滚到可见」由 `onFocusNode` 管（它要走 `focusDurationMs` 才到位）；这里给一个
 * `delayMs` 让这一闪落在镜头停下之后，⛔ 不在镜头还在动时就闪完。
 * ⛔ 不再借「上游变了」那颗蓝点来亮（§7 的变更标记是另一件事，混用就是两种高亮）。
 */

import { useCallback, useSyncExternalStore } from 'react'

import { NODE_V4_CONNECT_TO_SHOT } from '@/constants/node-studio'
import { flashAssistantTouchedNode } from '@/hooks/node/node-ingest-dom'

export function flashNodeCard(nodeId: string, delayMs = 0): void {
  if (delayMs <= 0) {
    flashAssistantTouchedNode(nodeId)
    return
  }
  window.setTimeout(() => flashAssistantTouchedNode(nodeId), delayMs)
}

/* ─────────────────────────────────────────────────────────────────────────
 * 落线被拒的那一下红环（S6e，spec §1.13「不连 + 卡面短暂红环 + toast 说明原因」）
 *
 * ⚠ 与上面那份高亮**分开记账**而不是加一个 `tone` 参数：两者会同时发生（刚被连上
 * 的卡随即被拒第二条线），共用一个 Set 的话后来的会把前一个的定时器清掉。
 * ───────────────────────────────────────────────────────────────────────── */

const rejectListeners = new Set<() => void>()
let rejecting: ReadonlySet<string> = new Set()
const rejectTimers = new Map<string, ReturnType<typeof setTimeout>>()

function emitReject() {
  for (const listener of rejectListeners) listener()
}

export function flashNodeCardReject(
  nodeId: string,
  ms: number = NODE_V4_CONNECT_TO_SHOT.highlightMs,
): void {
  const existing = rejectTimers.get(nodeId)
  if (existing) clearTimeout(existing)
  const next = new Set(rejecting)
  next.add(nodeId)
  rejecting = next
  rejectTimers.set(
    nodeId,
    setTimeout(() => {
      rejectTimers.delete(nodeId)
      const after = new Set(rejecting)
      after.delete(nodeId)
      rejecting = after
      emitReject()
    }, ms),
  )
  emitReject()
}

/** 测试用。⛔ 生产代码不调。 */
export function resetNodeCardReject(): void {
  for (const timer of rejectTimers.values()) clearTimeout(timer)
  rejectTimers.clear()
  rejecting = new Set()
  emitReject()
}

export function useNodeCardReject(nodeId: string | null): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    rejectListeners.add(onChange)
    return () => {
      rejectListeners.delete(onChange)
    }
  }, [])
  const get = useCallback(
    () => (nodeId === null ? false : rejecting.has(nodeId)),
    [nodeId],
  )
  return useSyncExternalStore(subscribe, get, () => false)
}
