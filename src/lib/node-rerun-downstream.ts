/**
 * **只重跑下游**：从一条 `plan_rerun_downstream` op 算出那份**只读名单**（第三期）。
 *
 * ── 分工 ──────────────────────────────────────────────────────────
 *  · `lib/node-downstream.ts` 只管拓扑（谁在谁的下游）；
 *  · 这里把拓扑翻译成**用户读得懂的一份清单**：名字、族、以及「几个要花钱」。
 * 拆成两层的判据：拓扑那一半会在别处被复用（删节点前的影响面、高亮），而这一半
 * 是这张卡专属的。
 *
 * ⚠ **文本节点不花钱**：它不生成任何东西，重跑它是个空动作。混进「要重跑 N 个」
 * 的计数里，用户会为一个不存在的开销做决定。
 * ⚠ ⛔ **不报一个具体的 credit 数**：那要问每个节点当前挂的模型与档位，而其中
 * 一半在重跑之前还会被上游改一次。报「图 2 · 视频 1」是它此刻真的知道的事；报
 * 「约 18 积分」是它猜的 —— 而审批点上的假数字比没有数字糟得多
 * （`competitor-assistants.md`：竞品的 credits 黑箱正是这么来的）。
 */

import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import type { NodeWorkflowMediaKind } from '@/constants/node-types'
import { collectDownstream } from '@/lib/node-downstream'
import { resolveV4NodeReadableName } from '@/lib/node-assistant-context'
import type { NodeV4, NodeWorkflowEdgeV4 } from '@/types/node-workflow'

export interface RerunDownstreamEntry {
  readonly id: string
  /** 用户与助手共用的那个名字（`@第02镜首帧` 指的就是它）。 */
  readonly name: string
  readonly kind: NodeWorkflowMediaKind
  /** 这一个重跑要不要花钱（文本节点不生成任何东西）。 */
  readonly paid: boolean
}

export interface RerunDownstreamPlan {
  /** 用户改的那一个 —— ⛔ 它不在 `entries` 里（除非显式 `includeSelf`）。 */
  readonly originId: string
  readonly originName: string
  readonly entries: readonly RerunDownstreamEntry[]
  /** 按族分的**要花钱的**个数 —— 卡上那一行「图 2 · 视频 1」读它。 */
  readonly paidByKind: Readonly<Partial<Record<NodeWorkflowMediaKind, number>>>
}

/**
 * `null` 的两种来路：起点不在图里（模型编了个 id），或者它一个下游都没有。
 * ⚠ 两者都**不出卡**：前者出卡是在展示一个幻觉，后者出的是一张空卡。
 */
export function buildRerunDownstreamPlan(input: {
  targetId: string
  includeSelf?: boolean
  nodes: readonly NodeV4[]
  edges: readonly NodeWorkflowEdgeV4[]
}): RerunDownstreamPlan | null {
  const byId = new Map(input.nodes.map((node) => [node.id, node]))
  const origin = byId.get(input.targetId)
  if (!origin) return null

  const ids = collectDownstream(input.targetId, input.edges)
  const ordered = input.includeSelf ? [input.targetId, ...ids] : ids

  const entries: RerunDownstreamEntry[] = []
  for (const id of ordered) {
    const node = byId.get(id)
    // ⚠ 边表里指向一个已经被删掉的节点是可能的（助手写的边 + 用户删了目标）——
    //    静默跳过，⛔ 不为它画一格「未知节点」。
    if (!node) continue
    entries.push({
      id,
      name: resolveV4NodeReadableName(node.data),
      kind: node.data.kind,
      paid: node.data.kind !== NODE_MEDIA_KIND_IDS.text,
    })
  }
  if (entries.length === 0) return null

  const paidByKind: Partial<Record<NodeWorkflowMediaKind, number>> = {}
  for (const entry of entries) {
    if (!entry.paid) continue
    paidByKind[entry.kind] = (paidByKind[entry.kind] ?? 0) + 1
  }

  return {
    originId: input.targetId,
    originName: resolveV4NodeReadableName(origin.data),
    entries,
    paidByKind,
  }
}
