'use client'

/**
 * 「拖一张卡喂给节点」的 v4 合法性层（第三期 · 画布 C3b）。
 *
 * ③d-4 起这是**唯一**的落槽合法性层（v3 的 `evaluateCastIngest` 已随画布翻转删
 * 除）。那一套的动画部分（磁吸 / 咬合 / 签字）与形状无关，原样搬进
 * `node-ingest-dom.ts` 继续用。
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
  NODE_MEDIA_KIND_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
} from '@/constants/node-types'
import { defaultMentionSlot } from '@/lib/node-mentions-to-slots'
import {
  canConnect,
  NODE_CONNECT_REJECT_REASON_IDS,
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

/* ═════════════════════════════════════════════════════════════════════════
 * 落哪个槽（C3c-②Q · 接线清单 9）
 * ═══════════════════════════════════════════════════════════════════════ */

export interface V4IngestSlotCandidate {
  readonly slot: NodeSlotId
  /** 这个口现在几条 / 上限几条；上限不可得时是 `null`（⛔ 不硬造一个数）。 */
  readonly capacity: { readonly current: number; readonly limit: number } | null
}

/**
 * 一次拖投的**落点决议**。
 *
 * ⚠ 三态而不是「一个 slot 或 null」：v4 的目标节点有多个具名口，**同一张图对
 * 镜头卡同时点亮首帧 / 尾帧 / 参考三个口**。此时替用户挑一个就是替他做主 ——
 * 挑首帧他会得到一个没打算要的关键帧，挑参考又违背「拖到首帧口上」的直觉。
 * 所以多口时这里**不挑**，把候选交回 UI 点亮（§3.3 理由必须可见的同一条：
 * 落点也必须可见）。
 *
 * ⛔ 不按端口表顺序取第一个当默认：那个顺序是**版式**顺序（§6 源节点自上而下），
 * 不是优先级，把它当优先级用就是拿排版当语义。
 */
export type V4IngestDropPlan =
  | { readonly kind: 'rejected'; readonly reason?: NodeConnectRejectReason }
  /** 只有一个口收得下 —— 可以直接落，不必问。 */
  | { readonly kind: 'single'; readonly candidate: V4IngestSlotCandidate }
  /** 多个口都收得下 —— 全部点亮，由用户挑。 */
  | {
      readonly kind: 'choose'
      readonly candidates: readonly V4IngestSlotCandidate[]
    }

/**
 * 纯函数：这一投落哪个槽。点亮与落点走**同一次** `evaluateV4Ingest`，
 * ⛔ 不许点亮一套判据、落点另一套（v3 那两处分家过一次）。
 */
export function planV4IngestDrop(
  source: NodeV4,
  target: NodeV4,
  edges: readonly NodeWorkflowEdgeV4[],
  nodes: readonly NodeV4[],
  capacityBySlot?: Partial<Record<NodeSlotId, number>>,
): V4IngestDropPlan {
  const evaluation = evaluateV4Ingest(
    source,
    target,
    edges,
    nodes,
    capacityBySlot,
  )
  if (!evaluation.legal || evaluation.slots.length === 0) {
    return {
      kind: 'rejected',
      ...(evaluation.reason ? { reason: evaluation.reason } : {}),
    }
  }
  const candidates = evaluation.slots.map((slot) => ({
    slot,
    capacity: previewV4SlotCapacity(target, slot, edges, capacityBySlot),
  }))
  const only = candidates[0]
  if (candidates.length === 1 && only)
    return { kind: 'single', candidate: only }

  // 视频镜头卡是唯一有默认落点的目标（spec §5 · 2026-09-10 owner 定稿）：
  // 「连线 / 拖放 / 上传 / 素材库都落进参考轨」，图默认作**参考**，首帧 / 尾帧
  // 是图的角色，挂上去之后在轨上点图改。⛔ 这不是「按端口表顺序取第一个」——
  // 落点走的是与 @ 引用同一张默认表（`defaultMentionSlot`）。
  if (
    target.data.kind === NODE_MEDIA_KIND_IDS.video &&
    target.data.subtype === NODE_V4_VIDEO_SUBTYPE_IDS.shot
  ) {
    const preferred = defaultMentionSlot(source.data.kind, target)
    const hit = candidates.find((candidate) => candidate.slot === preferred)
    if (hit) return { kind: 'single', candidate: hit }
  }

  return { kind: 'choose', candidates }
}

/* ═════════════════════════════════════════════════════════════════════════
 * 落线 / 整卡落卡的落槽决议（S6e，spec §1.13）
 * ═══════════════════════════════════════════════════════════════════════ */

export type V4ConnectDropPlan =
  | { readonly kind: 'rejected'; readonly reason: NodeConnectRejectReason }
  | { readonly kind: 'connect'; readonly slot: NodeSlotId }

/**
 * 一条拖出来的线（或整张拖过去的卡）落进哪个槽（spec §1.13）。
 *
 * 「线松在卡上**任何位置**都算连上，落进哪个槽由来源种类决定」——所以这里**不问
 * 用户**（`planV4IngestDrop` 的 `choose` 那一档在这条路径上不存在：拖线时用户瞄的
 * 是整张卡，不是某个口）。默认表复用 `defaultMentionSlot`（§8.2 的同一张），
 * ⛔ 不第三次写「图→参考 / 语音→语音 / 文本→说明」。
 *
 * 首选口不存在或收不下时**不换一个口硬塞**：只在「恰好一个口收得下」时回落
 * （`audio.voice` 的 `timbre`、文本卡的 `source` 都是这种），否则按拒绝算并把理由
 * 交出去 —— 静默落进一个用户没想要的槽比不连更糟。
 */
export function planV4ConnectDrop(
  source: NodeV4,
  target: NodeV4,
  edges: readonly NodeWorkflowEdgeV4[],
  nodes: readonly NodeV4[],
  capacityBySlot?: Partial<Record<NodeSlotId, number>>,
): V4ConnectDropPlan {
  const evaluation = evaluateV4Ingest(
    source,
    target,
    edges,
    nodes,
    capacityBySlot,
  )
  if (!evaluation.legal || evaluation.slots.length === 0) {
    // ⚠ 叶子源（`image.reference` / `video.clip`）一个入口都没有 —— `evaluateV4Ingest`
    // 那时连「第一个口」都取不到，于是给不出理由。这一档在这里补上。
    const hasInputs = (listAllSlots(target).length ?? 0) > 0
    return {
      kind: 'rejected',
      reason: hasInputs
        ? (evaluation.reason ?? NODE_CONNECT_REJECT_REASON_IDS.kindNotAllowed)
        : NODE_CONNECT_REJECT_REASON_IDS.unknownSlot,
    }
  }
  const preferred = defaultMentionSlot(source.data.kind, target)
  if (preferred && evaluation.slots.includes(preferred)) {
    return { kind: 'connect', slot: preferred }
  }
  const only = evaluation.slots.length === 1 ? evaluation.slots[0] : undefined
  if (only) return { kind: 'connect', slot: only }
  // 首选口满了（其余口还空着）—— 这是「槽满」，⛔ 不改落别的口。
  return {
    kind: 'rejected',
    reason: NODE_CONNECT_REJECT_REASON_IDS.slotFull,
  }
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
