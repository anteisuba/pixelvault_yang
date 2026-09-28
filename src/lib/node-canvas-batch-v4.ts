/**
 * 一批 v4 op 落到一份 state 上 —— **纯函数**（`docs/references/mcp.md` §2 第 2 条）。
 *
 * 图引擎的 `dispatchBatch`（助手提案 / 站内助手 `canvas_apply`）与服务端的 MCP
 * `apply_ops` 调的是**这同一个函数**。⛔ 不在服务端另写一份执行逻辑：那会让
 * 「Claude 改的」和「用户点的」变成两条会漂的路径（node 域禁改第 1 条）。
 *
 * 一批 = 在工作副本上串行推进 → 整图槽位规整 → `@图N` 跟着参考轨改写 → 再规整。
 * 收成**一个** inverse（序列），调用方把它记成一个撤销条目。
 */

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import {
  applyNodeAssistantOpV4,
  type ApplyOpV4Context,
  type NodeV4Inverse,
} from '@/lib/node-assistant-op-apply-v4'
import { reconcileStateSlots } from '@/lib/node-slot-binding'
import { planRailMentionRemaps } from '@/lib/video-node-rail'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type { NodeWorkflowStateV4 } from '@/types/node-workflow'

/**
 * 参考轨变了，正文里的 `@图N` 跟着走（owner 2026-09-28）—— 图引擎三条提交口
 * （`dispatch` / `dispatchBatch` / `deleteNodes`）与本文件共用。改写作为普通
 * `set_prompt` 落在**同一个撤销条目**里：一次 ⌘Z 连线与正文一起回来。返回补完的
 * state 与改写的 inverse（正序）。
 *
 * ⚠ `before` / `after` 都要是 reconcile 过的：轨的顺序读的是槽绑定。
 */
export function applyRailMentionRemaps(
  before: NodeWorkflowStateV4,
  after: NodeWorkflowStateV4,
  mintId: (prefix: string) => string,
): { state: NodeWorkflowStateV4; inverses: NodeV4Inverse[] } {
  let working = after
  const inverses: NodeV4Inverse[] = []
  for (const op of planRailMentionRemaps(before, after)) {
    const result = applyNodeAssistantOpV4(working, op, { mintId })
    if (!result.ok) continue
    working = result.state
    inverses.push(result.inverse)
  }
  return { state: working, inverses }
}

export interface CanvasBatchContext {
  readonly mintId: (prefix: string) => string
  readonly resolveModel?: ApplyOpV4Context['resolveModel']
  readonly castCards?: ApplyOpV4Context['castCards']
}

export interface CanvasBatchFailure {
  /** 这一条在批里的位置（0 起）。 */
  readonly index: number
  readonly reason: string
}

export interface CanvasBatchResult {
  /** 落完的 state；一条都没落 = 原样返回入参。 */
  readonly state: NodeWorkflowStateV4
  /** 整批的撤销；一条都没落 = `null`（⛔ 不记空条目）。 */
  readonly inverse: NodeV4Inverse | null
  readonly applied: number
  readonly skipped: number
  /** `skipped` 里连线 / 挂载没建成的那一部分（台账 K-2）。 */
  readonly failedConnects: number
  readonly createdNodeIds: readonly string[]
  readonly changedNodeIds: readonly string[]
  readonly failures: readonly CanvasBatchFailure[]
}

export function applyCanvasBatchV4(
  state: NodeWorkflowStateV4,
  ops: readonly NodeAssistantOpV4[],
  context: CanvasBatchContext,
): CanvasBatchResult {
  let working = state
  const inverses: NodeV4Inverse[] = []
  // 批内别名表（`add_node.ref`）—— 执行器自己往里写，后面的 op 因此认得出这一批
  // 刚建的节点。
  const refs = new Map<string, string>()
  const createdNodeIds: string[] = []
  const changedNodeIds = new Set<string>()
  const failures: CanvasBatchFailure[] = []
  let applied = 0
  let failedConnects = 0

  ops.forEach((op, index) => {
    const result = applyNodeAssistantOpV4(working, op, {
      mintId: context.mintId,
      refs,
      ...(context.resolveModel ? { resolveModel: context.resolveModel } : {}),
      ...(context.castCards ? { castCards: context.castCards } : {}),
    })
    if (!result.ok) {
      failures.push({ index, reason: result.reason })
      // 连线没建成要**单独记账**（台账 K-2）：其余的 skipped 多半是用户自己剔掉了
      // 引用的节点，而连线失败意味着规划的结构没成形 —— 一个只会变大的「已落 N 个」
      // 恰恰盖住它。
      if (
        op.op === NODE_ASSISTANT_OP_V4_IDS.connect ||
        op.op === NODE_ASSISTANT_OP_V4_IDS.attachAsset
      ) {
        failedConnects += 1
      }
      return
    }
    working = result.state
    inverses.push(result.inverse)
    applied += 1
    for (const id of result.changedNodeIds) changedNodeIds.add(id)
    if (op.op === NODE_ASSISTANT_OP_V4_IDS.addNode) {
      const created = result.changedNodeIds[0]
      if (created) createdNodeIds.push(created)
    }
  })

  const skipped = failures.length
  if (applied === 0) {
    return {
      state,
      inverse: null,
      applied,
      skipped,
      failedConnects,
      createdNodeIds,
      changedNodeIds: [],
      failures,
    }
  }

  const reconciled = reconcileStateSlots(working)
  const remap = applyRailMentionRemaps(state, reconciled, context.mintId)
  inverses.push(...remap.inverses)
  const next =
    remap.inverses.length > 0 ? reconcileStateSlots(remap.state) : reconciled

  return {
    state: next,
    inverse: { kind: 'sequence', items: [...inverses].reverse() },
    applied,
    skipped,
    failedConnects,
    createdNodeIds,
    changedNodeIds: [...changedNodeIds],
    failures,
  }
}

/**
 * 服务端铸 id（MCP 写入 / 导出落卡）—— 与图引擎的 `mintId` 同一个形状
 * （前缀 + uuid），⛔ 服务端各处别再各写一份。
 */
export function mintCanvasId(prefix: string): string {
  return `${prefix}${globalThis.crypto.randomUUID()}`
}
