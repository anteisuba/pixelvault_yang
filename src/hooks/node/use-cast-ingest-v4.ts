'use client'

/**
 * 「拖一张卡喂给节点」的 v4 合法性层（第三期 · 画布 C3b）。
 *
 * ⛔ **写好不接线** —— 生产调用方为 0，接线在 C3c（`StudioNodeWorkbench.tsx` 四处、
 * `IngestDragLayer.tsx` 三处、`node-assistant-op-plan.ts` 一处的
 * `evaluateCastIngest` / `previewIngestCapacity` 换成这里两个）。v3 那个钩子的
 * 动画部分（磁吸 / 咬合 / 签字）与本片无关，翻转时原样留用。
 *
 * ── v4 把「能不能吃」变成了「吃进哪个口」───────────────────────────────
 * v3 只能回答 yes/no（`canConnectNodeTypes` 今天恒真，容量另问
 * `resolveIngestCapacity`），落点是隐式的「一个节点一个入口」。v4 的目标节点有
 * **多个具名口**，所以这里回答的是「哪几个口现在亮着」，落哪个由用户/调用方在
 * 亮着的里面挑 —— 点亮与落点走的是同一个函数（`listLiveConnectableSlots` →
 * `canConnect`），⛔ 不许点亮和落点各算各的。
 */

import { useCallback } from 'react'

import {
  getNodeV4Ports,
  getNodeV4Slot,
  type NodeSlotId,
} from '@/constants/node-slots'
import {
  canConnect,
  type NodeConnectRejectReason,
} from '@/lib/node-connection-rules'
import {
  listLiveConnectableSlots,
  planSlotConnectRole,
  toConnectionEndpoint,
} from '@/lib/node-slot-binding'
import type { NodeV4, NodeWorkflowEdgeV4 } from '@/types/node-workflow'

export interface V4IngestEvaluation {
  /** 至少有一个口收得下。 */
  readonly legal: boolean
  /** 现在亮着的口，按端口表顺序。 */
  readonly slots: readonly NodeSlotId[]
  /**
   * 一个口都不亮时的**首要理由** —— 取第一个入口的拒绝原因。
   * ⚠ 理由必须可见（§3.3）：静默不亮和端口坏掉长得一模一样。
   */
  readonly reason?: NodeConnectRejectReason
}

/**
 * 纯函数：这张卡能不能喂给那个节点、能进哪几个口。
 *
 * `capacityBySlot` 是**模型给的动态上限**（`0..N` 的槽跟模型走，端口表只写静态
 * 判据）。不给 = 只按静态判据算。
 */
export function evaluateV4Ingest(
  source: NodeV4,
  target: NodeV4,
  edges: readonly NodeWorkflowEdgeV4[],
  nodes: readonly NodeV4[],
  capacityBySlot?: Partial<Record<NodeSlotId, number>>,
): V4IngestEvaluation {
  const slots = listLiveConnectableSlots(source, target, edges, {
    nodes,
    ...(capacityBySlot ? { capacityBySlot } : {}),
  })
  if (slots.length > 0) return { legal: true, slots }

  // 一个都不亮 —— 把第一个口的拒绝理由拿出来说。⛔ 不编一句「不能连」了事。
  const firstSlot = listAllSlots(target)[0]
  if (!firstSlot) return { legal: false, slots: [] }
  const plan = planSlotConnectRole(source, target, firstSlot, edges, nodes)
  const result = canConnect(
    toConnectionEndpoint(source),
    toConnectionEndpoint(target),
    {
      slot: firstSlot,
      occupancy: plan.occupancy,
      ...(plan.role ? { role: plan.role } : {}),
      ...(capacityBySlot?.[firstSlot] === undefined
        ? {}
        : { capacity: capacityBySlot[firstSlot] }),
    },
  )
  return {
    legal: false,
    slots: [],
    ...(result.ok ? {} : { reason: result.reason }),
  }
}

/** 目标节点的全部入口，按端口表顺序。 */
function listAllSlots(target: NodeV4): NodeSlotId[] {
  return (
    getNodeV4Ports(target.data.kind, target.data.subtype)?.inputs.map(
      (spec) => spec.slot,
    ) ?? []
  )
}

/** 张口预览的 `n/m`：这个口现在几条、上限几条。 */
export function previewV4SlotCapacity(
  target: NodeV4,
  slot: NodeSlotId,
  edges: readonly NodeWorkflowEdgeV4[],
  capacityBySlot?: Partial<Record<NodeSlotId, number>>,
): { readonly current: number; readonly limit: number } | null {
  const spec = getNodeV4Slot(target.data.kind, target.data.subtype, slot)
  if (!spec) return null
  const limit = capacityBySlot?.[slot] ?? spec.max
  if (limit === null || limit === undefined) return null
  const current = edges.filter(
    (edge) => edge.target === target.id && edge.slot === slot,
  ).length
  return { current, limit }
}

/** React 外壳：把上面两个纯函数绑到当前这张图上。 */
export function useCastIngestV4(
  nodes: readonly NodeV4[],
  edges: readonly NodeWorkflowEdgeV4[],
  capacityBySlot?: Partial<Record<NodeSlotId, number>>,
) {
  const evaluate = useCallback(
    (source: NodeV4, target: NodeV4) =>
      evaluateV4Ingest(source, target, edges, nodes, capacityBySlot),
    [edges, nodes, capacityBySlot],
  )
  const previewCapacity = useCallback(
    (target: NodeV4, slot: NodeSlotId) =>
      previewV4SlotCapacity(target, slot, edges, capacityBySlot),
    [edges, capacityBySlot],
  )
  return { evaluate, previewCapacity }
}
