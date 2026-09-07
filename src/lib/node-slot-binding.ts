/**
 * v4 槽绑定：连线进槽 · 版本轮播 · 停用（node-canvas-v2 §1.4 / §3.4）。
 *
 * ── 为什么 binding 要能从边表重算 ─────────────────────────────────────
 * 边是事实，binding 是「这个槽当前用哪条边」的指针。迁移产物（`migrateNode
 * WorkflowStateToV4`）只写边的 `slot`，**不写 `data.slots`**；如果渲染层只读
 * `slots`，迁移完的项目会显示成一堆空槽。所以这里给一个幂等的 `reconcile`：
 * 从边表把每个槽的 `versions` 补齐、把指向已删边的版本剔掉、把 `cur` 修回合法值。
 *
 * versionId 由**边 id 派生**而不是随机生成 —— 同一份 state 重算两次必须得到同一
 * 批 versionId，否则「翻到第 3 版」在下一次 reconcile 之后就指向别处了。
 *
 * ⛔ 纯函数：不碰 DOM、不碰网络、不读时钟（`now` 注入）。
 */

import {
  NODE_SLOT_OUTPUT_IDS,
  getNodeV4Ports,
  getNodeV4Slot,
  slotSupportsVersions,
  type NodeSlotId,
  type NodeSlotOutputId,
} from '@/constants/node-slots'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { NODE_V4_SLOT_VERSION } from '@/constants/node-studio'
import {
  canConnect,
  type NodeConnectRejectReason,
  type NodeConnectionEndpoint,
} from '@/lib/node-connection-rules'
import type {
  NodeV4,
  NodeV4Data,
  NodeV4SlotBinding,
  NodeV4SlotVersion,
  NodeWorkflowEdgeV4,
  NodeWorkflowStateV4,
} from '@/types/node-workflow'

/** 版本 id 由边 id 派生 —— 重算幂等的根据。 */
export function slotVersionId(edgeId: string): string {
  return `${NODE_V4_SLOT_VERSION.idPrefix}${edgeId}`
}

/** 这个节点在语义门（§3.3）里算不算「已判失败」。只有图片子型带这个字段。 */
export function isBlockedSource(data: NodeV4Data): boolean {
  return data.kind === NODE_MEDIA_KIND_IDS.image && data.blocked === true
}

export function toConnectionEndpoint(node: NodeV4): NodeConnectionEndpoint {
  return {
    id: node.id,
    kind: node.data.kind,
    subtype: node.data.subtype,
    blocked: isBlockedSource(node.data),
  }
}

type SlotBindings = NonNullable<NodeV4Data['slots']>

/**
 * 把一个节点各槽的 binding 与边表对齐。幂等。
 *
 * - 边在、版本不在 → 追加版本（`addedAt = now`）
 * - 版本在、边不在 → 剔除（`disconnect` 的落点）
 * - `cur` 指向已剔除或已停用的版本 → 回落到**最近一个未停用版**；都没有 → `null`
 */
export function reconcileSlotBindings(
  node: NodeV4,
  edges: readonly NodeWorkflowEdgeV4[],
  options: { now?: string } = {},
): SlotBindings | undefined {
  const ports = getNodeV4Ports(node.data.kind, node.data.subtype)
  if (!ports || ports.inputs.length === 0) return undefined
  const now = options.now ?? new Date().toISOString()
  const next: SlotBindings = {}

  for (const spec of ports.inputs) {
    const incoming = edges.filter(
      (edge) => edge.target === node.id && edge.slot === spec.slot,
    )
    if (incoming.length === 0) continue

    const previous = node.data.slots?.[spec.slot]
    const liveEdgeIds = new Set(incoming.map((edge) => edge.id))
    const kept = (previous?.versions ?? []).filter((version) =>
      liveEdgeIds.has(version.edgeId),
    )
    const knownEdgeIds = new Set(kept.map((version) => version.edgeId))
    const versions: NodeV4SlotVersion[] = [...kept]
    for (const edge of incoming) {
      if (knownEdgeIds.has(edge.id)) continue
      versions.push({
        id: slotVersionId(edge.id),
        edgeId: edge.id,
        sourceNodeId: edge.source,
        blocked: false,
        addedAt: now,
      })
    }

    next[spec.slot] = {
      slot: spec.slot,
      versions: versions.slice(-NODE_V4_SLOT_VERSION.maxVersions),
      cur: resolveCurrent(versions, previous?.cur ?? null),
    }
  }

  return Object.keys(next).length > 0 ? next : undefined
}

/** `cur` 的落点规则：保留合法旧值，否则回落到最近一个未停用版，再否则 `null`。 */
function resolveCurrent(
  versions: readonly NodeV4SlotVersion[],
  preferred: string | null,
): string | null {
  const stillThere = versions.find(
    (version) => version.id === preferred && !version.blocked,
  )
  if (stillThere) return stillThere.id
  for (let index = versions.length - 1; index >= 0; index -= 1) {
    const candidate = versions[index]
    if (candidate && !candidate.blocked) return candidate.id
  }
  return null
}

/** 整图 reconcile —— 加载一份 v4 state 之后跑一次，渲染层就只读 `slots`。 */
export function reconcileStateSlots(
  state: NodeWorkflowStateV4,
  options: { now?: string } = {},
): NodeWorkflowStateV4 {
  const nodes = state.nodes.map((node) => {
    const slots = reconcileSlotBindings(node, state.edges, options)
    if (!slots && !node.data.slots) return node
    const nextData = { ...node.data } as NodeV4Data
    if (slots) nextData.slots = slots
    else delete nextData.slots
    return { ...node, data: nextData }
  })
  return { ...state, nodes }
}

/** 某个槽当前占了几条边（`canConnect` 的 `occupancy`）。 */
export function getSlotOccupancy(
  nodeId: string,
  slot: NodeSlotId,
  edges: readonly NodeWorkflowEdgeV4[],
): number {
  return edges.filter((edge) => edge.target === nodeId && edge.slot === slot)
    .length
}

/**
 * 拖线阶段：目标节点上哪些槽该点亮。与 `listConnectableSlots` 的差别是这里自己
 * 从边表算 occupancy —— 调用方（画布）手上就是整份 state。
 */
export function listLiveConnectableSlots(
  source: NodeV4,
  target: NodeV4,
  edges: readonly NodeWorkflowEdgeV4[],
  capacityBySlot?: Partial<Record<NodeSlotId, number>>,
): NodeSlotId[] {
  const ports = getNodeV4Ports(target.data.kind, target.data.subtype)
  if (!ports) return []
  const from = toConnectionEndpoint(source)
  const to = toConnectionEndpoint(target)
  return ports.inputs
    .filter(
      (spec) =>
        canConnect(from, to, {
          slot: spec.slot,
          occupancy: getSlotOccupancy(target.id, spec.slot, edges),
          capacity: capacityBySlot?.[spec.slot],
        }).ok,
    )
    .map((spec) => spec.slot)
}

export interface ConnectIntoSlotParams {
  readonly source: string
  readonly target: string
  readonly slot: NodeSlotId
  readonly sourceHandle?: NodeSlotOutputId
  /** 新边 id。调用方给（画布用 ReactFlow 的 id 规则，助手用批次 id）。 */
  readonly edgeId: string
  readonly now?: string
  readonly capacity?: number
}

export type ConnectIntoSlotResult =
  | {
      readonly ok: false
      readonly reason: NodeConnectRejectReason | 'unknownNode' | 'duplicateEdge'
    }
  | {
      readonly ok: true
      readonly state: NodeWorkflowStateV4
      readonly edgeId: string
      readonly versionId: string
      /** 落进一个已有内容的轮播槽 → 这是「加为第 N 版并设为当前」。 */
      readonly addedAsVersion: boolean
      readonly versionCount: number
    }

/**
 * 建一条边并让内容进槽（§3.4 + §1.4）。往已有内容的 0..1 槽再连一条**不是超限**，
 * 而是追加新版本并设为当前；旧版不删边。
 */
export function connectIntoSlot(
  state: NodeWorkflowStateV4,
  params: ConnectIntoSlotParams,
): ConnectIntoSlotResult {
  const source = state.nodes.find((node) => node.id === params.source)
  const target = state.nodes.find((node) => node.id === params.target)
  if (!source || !target) return { ok: false, reason: 'unknownNode' }

  const occupancy = getSlotOccupancy(target.id, params.slot, state.edges)
  const verdict = canConnect(
    toConnectionEndpoint(source),
    toConnectionEndpoint(target),
    { slot: params.slot, occupancy, capacity: params.capacity },
  )
  if (!verdict.ok) return { ok: false, reason: verdict.reason }

  const duplicate = state.edges.some(
    (edge) =>
      edge.source === params.source &&
      edge.target === params.target &&
      edge.slot === params.slot,
  )
  if (duplicate) return { ok: false, reason: 'duplicateEdge' }

  const spec = getNodeV4Slot(target.data.kind, target.data.subtype, params.slot)
  const versioned = spec ? slotSupportsVersions(spec) : false
  const edge: NodeWorkflowEdgeV4 = {
    id: params.edgeId,
    source: params.source,
    sourceHandle: params.sourceHandle ?? NODE_SLOT_OUTPUT_IDS.out,
    target: params.target,
    slot: params.slot,
  }
  const edges = [...state.edges, edge]
  const now = params.now ?? new Date().toISOString()
  const versionId = slotVersionId(edge.id)

  const nodes = state.nodes.map((node) => {
    if (node.id !== target.id) return node
    const slots = reconcileSlotBindings(node, edges, { now })
    if (!slots) return node
    const binding = slots[params.slot]
    // 新连入自动成为当前版（§1.4）——reconcile 的默认回落已是「最近一个未停用
    // 版」，新版正好排在尾部，这里显式写一次让意图留在代码里。
    if (binding) slots[params.slot] = { ...binding, cur: versionId }
    return { ...node, data: { ...node.data, slots } as NodeV4Data }
  })

  const nextTarget = nodes.find((node) => node.id === target.id)
  const versionCount =
    nextTarget?.data.slots?.[params.slot]?.versions.length ?? 1

  return {
    ok: true,
    state: { ...state, nodes, edges },
    edgeId: edge.id,
    versionId,
    addedAsVersion: versioned && occupancy > 0,
    versionCount,
  }
}

/** 断开一条边：删边 + 重算目标节点的 binding（`cur` 按规则回落）。 */
export function disconnectEdge(
  state: NodeWorkflowStateV4,
  edgeId: string,
  options: { now?: string } = {},
): { state: NodeWorkflowStateV4; removed: NodeWorkflowEdgeV4 | undefined } {
  const removed = state.edges.find((edge) => edge.id === edgeId)
  if (!removed) return { state, removed: undefined }
  const edges = state.edges.filter((edge) => edge.id !== edgeId)
  const nodes = state.nodes.map((node) => {
    if (node.id !== removed.target) return node
    const slots = reconcileSlotBindings(node, edges, options)
    const nextData = { ...node.data } as NodeV4Data
    if (slots) nextData.slots = slots
    else delete nextData.slots
    return { ...node, data: nextData }
  })
  return { state: { ...state, nodes, edges }, removed }
}

export type SlotVersionResult =
  | {
      readonly ok: false
      readonly reason: 'unknownSlot' | 'unknownVersion' | 'blockedVersion'
      readonly blockedReason?: string
    }
  | { readonly ok: true; readonly state: NodeWorkflowStateV4 }

/**
 * 「设为当前」。⚠ 指向 `blocked` 版本时**拒绝并给理由** —— 与手动路径、与拖线被
 * 拒是同一条规则的三个出口（§1.4 / §3.3）。
 */
export function setSlotVersion(
  state: NodeWorkflowStateV4,
  nodeId: string,
  slot: NodeSlotId,
  versionId: string,
): SlotVersionResult {
  const node = state.nodes.find((item) => item.id === nodeId)
  const binding = node?.data.slots?.[slot]
  if (!node || !binding) return { ok: false, reason: 'unknownSlot' }
  const version = binding.versions.find((item) => item.id === versionId)
  if (!version) return { ok: false, reason: 'unknownVersion' }
  if (version.blocked) {
    return {
      ok: false,
      reason: 'blockedVersion',
      ...(version.blockedReason
        ? { blockedReason: version.blockedReason }
        : {}),
    }
  }
  return {
    ok: true,
    state: patchBinding(state, nodeId, slot, { cur: versionId }),
  }
}

/** 停用 / 恢复一个版本。停用当前版 → `cur` 按同一条规则回落。 */
export function markVersionBlocked(
  state: NodeWorkflowStateV4,
  nodeId: string,
  slot: NodeSlotId,
  versionId: string,
  blocked: boolean,
  reason?: string,
): SlotVersionResult {
  const node = state.nodes.find((item) => item.id === nodeId)
  const binding = node?.data.slots?.[slot]
  if (!node || !binding) return { ok: false, reason: 'unknownSlot' }
  if (!binding.versions.some((item) => item.id === versionId)) {
    return { ok: false, reason: 'unknownVersion' }
  }
  const versions = binding.versions.map((item) =>
    item.id === versionId
      ? {
          ...item,
          blocked,
          ...(blocked && reason
            ? { blockedReason: reason }
            : { blockedReason: undefined }),
        }
      : item,
  )
  return {
    ok: true,
    state: patchBinding(state, nodeId, slot, {
      versions,
      cur: resolveCurrent(versions, binding.cur),
    }),
  }
}

function patchBinding(
  state: NodeWorkflowStateV4,
  nodeId: string,
  slot: NodeSlotId,
  patch: Partial<NodeV4SlotBinding>,
): NodeWorkflowStateV4 {
  const nodes = state.nodes.map((node) => {
    const binding = node.id === nodeId ? node.data.slots?.[slot] : undefined
    if (!binding) return node
    const slots = { ...node.data.slots, [slot]: { ...binding, ...patch } }
    return { ...node, data: { ...node.data, slots } as NodeV4Data }
  })
  return { ...state, nodes }
}

/** 槽内当前版指向的源节点 id（快照、缩略、`@` 解析共用）。 */
export function resolveCurrentSourceId(
  node: NodeV4,
  slot: NodeSlotId,
): string | undefined {
  const binding = node.data.slots?.[slot]
  if (!binding?.cur) return undefined
  return binding.versions.find((item) => item.id === binding.cur)?.sourceNodeId
}
