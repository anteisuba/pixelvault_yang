/**
 * v4 槽绑定：连线进槽 · 版本轮播 · 停用（node-canvas-v2 §9.2 / §9.3）。
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
  NODE_SLOT_TEXT_ROLE_FALLBACK,
  NODE_SLOT_TEXT_ROLE_IDS,
  getNodeV4Ports,
  getNodeV4Slot,
  resolveSlotRoleCapacity,
  slotSupportsVersions,
  type NodeSlotId,
  type NodeEdgeVia,
  type NodeSlotOutputId,
  type NodeSlotTextRole,
} from '@/constants/node-slots'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { NODE_V4_SLOT_VERSION } from '@/constants/node-studio'
import {
  canConnect,
  resolveTextSlotRole,
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

/* ─────────────────────────────────────────────────────────────────────────
 * 文本槽的角色（C1 契约修正 2）
 *
 * 角色是**边的属性**：同一份文本可以在 A 镜当剧本、在 B 镜当风格约束。所以它落在
 * `slots[].versions[].role` 上，不在节点身份里；容量按角色算（script 0..1 /
 * style 0..N / character 0..N），`canConnect` 的 `occupancy` 因此必须是**同角色**
 * 的占用数，⛔ 不是这个槽的总边数。
 * ───────────────────────────────────────────────────────────────────────── */

/** 这个槽分不分角色（今天只有带 `byRole` 的 `video.shot.text`）。 */
function slotHasRoles(target: NodeV4, slot: NodeSlotId): boolean {
  return Boolean(
    getNodeV4Slot(target.data.kind, target.data.subtype, slot)?.byRole,
  )
}

/**
 * 一条已有边在文本槽里当什么用：binding 上落过的 `role` 优先（那是当初连线时的
 * 决定），否则按源节点的 `defaultRole` / 子型推——迁移产物只有边没有 binding，
 * 这条回落就是它们的角色来源。
 */
export function resolveEdgeTextRole(
  edge: NodeWorkflowEdgeV4,
  target: NodeV4,
  nodes: readonly NodeV4[],
): NodeSlotTextRole | undefined {
  if (!slotHasRoles(target, edge.slot)) return undefined
  const recorded = target.data.slots?.[edge.slot]?.versions.find(
    (version) => version.edgeId === edge.id,
  )?.role
  if (recorded) return recorded
  const source = nodes.find((node) => node.id === edge.source)
  if (!source || source.data.kind !== NODE_MEDIA_KIND_IDS.text) return undefined
  return resolveTextSlotRole({
    subtype: source.data.subtype,
    ...(source.data.defaultRole
      ? { defaultRole: source.data.defaultRole }
      : {}),
  })
}

/** 某个槽在**某个角色**下占了几条边。 */
export function getSlotRoleOccupancy(
  target: NodeV4,
  slot: NodeSlotId,
  edges: readonly NodeWorkflowEdgeV4[],
  nodes: readonly NodeV4[],
  role: NodeSlotTextRole,
): number {
  return edges.filter(
    (edge) =>
      edge.target === target.id &&
      edge.slot === slot &&
      (resolveEdgeTextRole(edge, target, nodes) ??
        NODE_SLOT_TEXT_ROLE_FALLBACK) === role,
  ).length
}

export interface SlotConnectRolePlan {
  /** 这条连线按哪个角色算。非角色槽 / 非文本源 → `undefined`。 */
  readonly role?: NodeSlotTextRole
  /** 传给 `canConnect` 的占用数：有角色时是同角色占用，否则是槽总占用。 */
  readonly occupancy: number
}

/**
 * 这条连线按哪个角色落、同角色已占几条。
 *
 * ⚠ **取舍（C2b，owner 未另行指定时的默认）**：没显式给角色、而推出来的角色已满
 * （`script` 0..1）时**自动落 `style`**，而不是把端口画灰。理由是拖一份文本到镜头
 * 上是个明确意图，而「这镜已经有剧本了」不该表现成「这里连不上」——那正是恒真矩阵
 * 那条注释里记下的坑（连不上和端口坏掉长得一模一样）。显式给了 `role` 就照给的算，
 * 满了就按满拒绝并给理由，⛔ 不替用户改主意。
 */
export function planSlotConnectRole(
  source: NodeV4,
  target: NodeV4,
  slot: NodeSlotId,
  edges: readonly NodeWorkflowEdgeV4[],
  nodes: readonly NodeV4[],
  explicitRole?: NodeSlotTextRole,
): SlotConnectRolePlan {
  const spec = getNodeV4Slot(target.data.kind, target.data.subtype, slot)
  if (!spec?.byRole || source.data.kind !== NODE_MEDIA_KIND_IDS.text) {
    return { occupancy: getSlotOccupancy(target.id, slot, edges) }
  }
  const preferred = resolveTextSlotRole({
    subtype: source.data.subtype,
    ...(source.data.defaultRole
      ? { defaultRole: source.data.defaultRole }
      : {}),
    ...(explicitRole ? { explicitRole } : {}),
  })
  const occupancy = getSlotRoleOccupancy(target, slot, edges, nodes, preferred)
  if (explicitRole) return { role: preferred, occupancy }
  const limit = resolveSlotRoleCapacity(spec, preferred).max
  if (limit !== null && occupancy >= limit) {
    const fallback = NODE_SLOT_TEXT_ROLE_IDS.style
    return {
      role: fallback,
      occupancy: getSlotRoleOccupancy(target, slot, edges, nodes, fallback),
    }
  }
  return { role: preferred, occupancy }
}

/**
 * 把一个节点各槽的 binding 与边表对齐。幂等。
 *
 * - 边在、版本不在 → 追加版本（`addedAt = now`）
 * - 版本在、边不在 → 剔除（`disconnect` 的落点）
 * - `cur` 指向已剔除或已停用的版本 → 回落到**最近一个未停用版**；都没有 → `null`
 */
export interface ReconcileSlotOptions {
  readonly now?: string
  /**
   * 新版本落哪个角色（C1 契约修正 2）。只对带 `byRole` 的槽有意义；不给这个函数
   * 时新版本不带 `role`，读侧按 `NODE_SLOT_TEXT_ROLE_FALLBACK` 算。
   */
  roleOf?(edge: NodeWorkflowEdgeV4): NodeSlotTextRole | undefined
}

export function reconcileSlotBindings(
  node: NodeV4,
  edges: readonly NodeWorkflowEdgeV4[],
  options: ReconcileSlotOptions = {},
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
      const role = spec.byRole ? options.roleOf?.(edge) : undefined
      versions.push({
        id: slotVersionId(edge.id),
        ...(role ? { role } : {}),
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

/**
 * 整图的 `roleOf`：按边的目标节点 + 源节点推角色。迁移产物只有边没有 binding，
 * 这条就是它们的角色来源（`text.script` 子型 → 剧本、`text.rule` → 风格约束、
 * 其余 → 剧本）。
 */
function buildRoleOf(
  nodes: readonly NodeV4[],
): (edge: NodeWorkflowEdgeV4) => NodeSlotTextRole | undefined {
  return (edge) => {
    const target = nodes.find((node) => node.id === edge.target)
    return target ? resolveEdgeTextRole(edge, target, nodes) : undefined
  }
}

/** 整图 reconcile —— 加载一份 v4 state 之后跑一次，渲染层就只读 `slots`。 */
export function reconcileStateSlots(
  state: NodeWorkflowStateV4,
  options: { now?: string } = {},
): NodeWorkflowStateV4 {
  const roleOf = buildRoleOf(state.nodes)
  let changed = false
  const nodes = state.nodes.map((node) => {
    const slots = reconcileSlotBindings(node, state.edges, {
      ...options,
      roleOf,
    })
    if (!slots && !node.data.slots) return node
    // ⚠ 引用相等要保住：这个函数现在**每一次图提交**都会跑一遍（v3 视图的折回
    // 写入口也调它），无脑造新对象等于每敲一个字把所有带槽的卡标脏。
    if (JSON.stringify(slots) === JSON.stringify(node.data.slots)) return node
    changed = true
    const nextData = { ...node.data } as NodeV4Data
    if (slots) nextData.slots = slots
    else delete nextData.slots
    return { ...node, data: nextData }
  })
  return changed ? { ...state, nodes } : state
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

export interface LiveConnectableOptions {
  /**
   * 画布上的全部节点——算**同角色占用**要按边找源节点（`planSlotConnectRole`）。
   * 不给时退化成只认 `source` / `target` 两个：其余文本边的角色只能从 binding 上
   * 已落的 `role` 读，读不到就按 `script` 算。
   */
  readonly nodes?: readonly NodeV4[]
  readonly capacityBySlot?: Partial<Record<NodeSlotId, number>>
}

/**
 * 拖线阶段：目标节点上哪些槽该点亮。与 `listConnectableSlots` 的差别是这里自己
 * 从边表算 occupancy —— 调用方（画布）手上就是整份 state。
 *
 * ⚠ 文本槽按**角色**算（C1 契约修正 2）：`script` 已满时按 `planSlotConnectRole`
 * 的取舍自动改按 `style` 点亮，落点与 `connectIntoSlot` 用的是同一个函数，⛔ 不许
 * 点亮和落点各算各的。
 */
export function listLiveConnectableSlots(
  source: NodeV4,
  target: NodeV4,
  edges: readonly NodeWorkflowEdgeV4[],
  options: LiveConnectableOptions = {},
): NodeSlotId[] {
  const ports = getNodeV4Ports(target.data.kind, target.data.subtype)
  if (!ports) return []
  const nodes = options.nodes ?? [source, target]
  const from = toConnectionEndpoint(source)
  const to = toConnectionEndpoint(target)
  return ports.inputs
    .filter((spec) => {
      const plan = planSlotConnectRole(source, target, spec.slot, edges, nodes)
      return canConnect(from, to, {
        slot: spec.slot,
        occupancy: plan.occupancy,
        ...(plan.role ? { role: plan.role } : {}),
        ...(options.capacityBySlot?.[spec.slot] === undefined
          ? {}
          : { capacity: options.capacityBySlot[spec.slot] }),
      }).ok
    })
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
  /**
   * 文本槽的角色（C1 契约修正 2）。不给 = 按源节点推，推出来的档满了就落 `style`
   * （见 `planSlotConnectRole` 的取舍）；给了就照给的算，满了按满拒绝。
   */
  readonly role?: NodeSlotTextRole
  /**
   * 这条边的来路（spec §8.2）。`mention` = 正文里的 `@` 建的——「退格删 @ 即断槽」
   * 只断打了这个标的边，⛔ 不碰手拖 / 手连进来的。缺席 = 其余三条路。
   */
  readonly via?: NodeEdgeVia
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

  const plan = planSlotConnectRole(
    source,
    target,
    params.slot,
    state.edges,
    state.nodes,
    params.role,
  )
  const occupancy = plan.occupancy
  const verdict = canConnect(
    toConnectionEndpoint(source),
    toConnectionEndpoint(target),
    {
      slot: params.slot,
      occupancy,
      ...(plan.role ? { role: plan.role } : {}),
      ...(params.capacity === undefined ? {} : { capacity: params.capacity }),
    },
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
    ...(params.via ? { data: { via: params.via } } : {}),
  }
  const edges = [...state.edges, edge]
  const now = params.now ?? new Date().toISOString()
  const versionId = slotVersionId(edge.id)

  // 新边的角色用上面算好的 plan，其余边沿用各自已落 / 可推的角色。
  const roleOf = (item: NodeWorkflowEdgeV4): NodeSlotTextRole | undefined =>
    item.id === edge.id
      ? plan.role
      : resolveEdgeTextRole(item, target, state.nodes)

  const nodes = state.nodes.map((node) => {
    if (node.id !== target.id) return node
    const slots = reconcileSlotBindings(node, edges, { now, roleOf })
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
  const roleOf = buildRoleOf(state.nodes)
  const nodes = state.nodes.map((node) => {
    if (node.id !== removed.target) return node
    const slots = reconcileSlotBindings(node, edges, { ...options, roleOf })
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
