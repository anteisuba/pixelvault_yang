/**
 * 多选运行的排程（纯函数 + 一个不碰 React 的异步调度器）。
 *
 * ── 解决的是什么 ──────────────────────────────────────────────────────
 * 框选几张卡一起跑，原来是**并行一把全发**：下游卡（首帧连着上游图）在上游还没出
 * 结果时就装配载荷，拿到的是上游的旧图或空槽 —— 花了钱、出的是错的。
 *
 * ── 判据 ──────────────────────────────────────────────────────────────
 * ① 上下游只由具名槽边定义，复用 `collectDownstream`（与「只重跑下游」同一份
 *    拓扑），⛔ 不看坐标 / 镜号。只看**选中集合内部**的依赖：没选的上游不等。
 * ② 下游等**它在选中集合里的全部上游**都出结果再发；任一上游没出结果（失败 / 被
 *    发送前校验拦下 / 轮询窗口关了仍在跑）→ 这张不发，交给调用方在卡上说明。
 * ③ 并发有上限（调用方传 `limit`，参照服务端 `MAX_ACTIVE_JOBS_PER_USER`）。
 * ④ 环安全：边表是人与助手一起写的，一条回连就会让「互相等」永远卡住。卡住时
 *    （没有在跑、也没有就绪的）把环里的卡当作彼此不依赖放行，⛔ 不死等。
 */

import { collectDownstream } from '@/lib/node-downstream'
import type { NodeWorkflowEdgeV4 } from '@/types/node-workflow'

/** 每张选中的卡 → 它在选中集合里的上游（含间接：A→x→B 且 x 没选时 B 仍等 A）。 */
export function buildSelectionRunDeps(
  nodeIds: readonly string[],
  edges: readonly NodeWorkflowEdgeV4[],
): Map<string, string[]> {
  const selected = new Set(nodeIds)
  const deps = new Map<string, string[]>(nodeIds.map((id) => [id, []]))
  for (const upstream of nodeIds) {
    for (const downstream of collectDownstream(upstream, edges)) {
      if (!selected.has(downstream) || downstream === upstream) continue
      deps.get(downstream)!.push(upstream)
    }
  }
  return deps
}

export type SelectionRunOutcome = 'done' | 'failed' | 'skipped'

export interface RunSelectionOptions {
  readonly nodeIds: readonly string[]
  readonly deps: ReadonlyMap<string, readonly string[]>
  /** 同时最多跑几张。 */
  readonly limit: number
  /** 跑一张；`true` = 出了结果（下游可以接着发）。⚠ 不许 reject：失败返回 `false`。 */
  run(nodeId: string): Promise<boolean>
  /** 上游没出结果，这张不发。 */
  onSkip?(nodeId: string, failedUpstream: readonly string[]): void
}

/**
 * 按依赖与并发上限跑完一批。返回每张的结局。
 *
 * ⚠ 卡与卡之间**不互相取消**：一张失败只挡它自己的下游，与它无关的照常发。
 */
export async function runSelectionInOrder({
  nodeIds,
  deps,
  limit,
  run,
  onSkip,
}: RunSelectionOptions): Promise<Map<string, SelectionRunOutcome>> {
  const outcome = new Map<string, SelectionRunOutcome>()
  const pending = new Set(nodeIds)
  const running = new Set<string>()
  /** 环里被放行的卡：它们之间的依赖不再等。 */
  const released = new Set<string>()
  const cap = Math.max(1, Math.floor(limit))

  return new Promise((resolve) => {
    const depsOf = (id: string) =>
      (deps.get(id) ?? []).filter(
        (dep) => !(released.has(id) && released.has(dep)),
      )

    const pump = () => {
      // 先结掉「上游已经没出结果」的那些（它们不占并发位）。
      let changed = true
      while (changed) {
        changed = false
        for (const id of pending) {
          const failed = depsOf(id).filter((dep) => {
            const state = outcome.get(dep)
            return state === 'failed' || state === 'skipped'
          })
          if (failed.length === 0) continue
          pending.delete(id)
          outcome.set(id, 'skipped')
          onSkip?.(id, failed)
          changed = true
        }
      }

      for (const id of pending) {
        if (running.size >= cap) break
        if (!depsOf(id).every((dep) => outcome.get(dep) === 'done')) continue
        pending.delete(id)
        running.add(id)
        void run(id)
          .catch(() => false)
          .then((ok) => {
            running.delete(id)
            outcome.set(id, ok ? 'done' : 'failed')
            pump()
          })
      }

      if (pending.size === 0 && running.size === 0) {
        resolve(outcome)
        return
      }
      // 卡住了（没有在跑的、剩下的全在互相等）= 有环：放行剩下的这一圈。
      if (running.size === 0) {
        for (const id of pending) released.add(id)
        pump()
      }
    }

    pump()
  })
}

/** 确认卡上那一行：几张、估得出价的加起来多少、几张估不出。 */
export function summarizeSelectionCost(costs: readonly (number | null)[]): {
  total: number
  unpriced: number
} {
  return costs.reduce<{ total: number; unpriced: number }>(
    (sum, cost) =>
      cost === null
        ? { ...sum, unpriced: sum.unpriced + 1 }
        : { ...sum, total: sum.total + cost },
    { total: 0, unpriced: 0 },
  )
}
