/**
 * Canvas connection contract (canvas-baseline §6, owner-ratified 2026-06-21;
 * shot-reference edges added 2026-06-25).
 *
 * Each node exposes a single input handle (no per-slot typing), so a connection
 * is validated at the (sourceType → targetType) level, with image roles
 * resolved on both ends. The matrix is STRICT — it lists only edges that are
 * actually consumed today, so "if you can connect it, it's used" (no
 * silently-ignored dead edges):
 *
 *   - seedance (video) is the aggregator: it reads shot text, image references
 *     (character / background / keyframe / shot), voice audio, and reference
 *     video clips (seedance / videoReference / videoMerge).
 *   - characterImage accepts voice — the voice→character→seedance audio-binding
 *     hop (harvestUpstreamAudioBindings labels @AudioN with the character name).
 *   - shot accepts character + background image references: the shot generator
 *     harvests them as named reference images (harvestUpstreamImageReferences)
 *     and labels them in the prompt legend so the model binds name → image.
 *   - videoMerge aggregates video-source clips.
 *   - every other node type is a leaf/source and accepts no inputs.
 *
 * frameImage still accepts nothing — its generator doesn't read the graph, so
 * allowing such edges would silently drop them.
 */

import {
  getNodeV4Ports,
  getNodeV4Slot,
  NODE_SLOT_IDS,
  type NodeSlotId,
} from '@/constants/node-slots'
import {
  NODE_TYPE_IDS,
  type NodeImageRole,
  type NodeV4Subtype,
  type NodeWorkflowMediaKind,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'

/** Target node type → source node types it accepts. Absent target = accepts none. */
export const NODE_CONNECTION_RULES: Partial<
  Record<NodeWorkflowNodeType, readonly NodeWorkflowNodeType[]>
> = {
  [NODE_TYPE_IDS.seedance]: [
    NODE_TYPE_IDS.shotText,
    NODE_TYPE_IDS.characterImage,
    NODE_TYPE_IDS.backgroundImage,
    NODE_TYPE_IDS.frameImage,
    NODE_TYPE_IDS.shot,
    // Unified image node (any role) — seedance accepts it as a reference, the
    // same way it accepts the legacy per-role image types above.
    NODE_TYPE_IDS.image,
    NODE_TYPE_IDS.voice,
    NODE_TYPE_IDS.seedance,
    NODE_TYPE_IDS.videoReference,
    NODE_TYPE_IDS.videoMerge,
  ],
  [NODE_TYPE_IDS.videoMerge]: [
    NODE_TYPE_IDS.seedance,
    NODE_TYPE_IDS.videoReference,
    NODE_TYPE_IDS.videoMerge,
  ],
}

/**
 * v3 的类型级准入判据 —— **恒真**（2026-07-28 owner：「全部放开。这些都不做限制了。」）。
 *
 * 换来的是「不再出现拖了半天连不上、且和端口坏掉长得一模一样」，代价是丢了
 * 「连得上就一定被用到」这条纪律：可以画出一条下游收割时被静默丢弃的边。
 *
 * TODO(C2)：v4 的具名槽落到 `NodeShell` / `StudioNodeWorkbench` 之后，这三个 v3
 * 调用方（`StudioNodeWorkbench:4179`、`use-cast-ingest:108`、`node-assistant-op-plan`）
 * 改调下面的 `canConnect`，本函数与 `NODE_CONNECTION_RULES` 随 12 个 legacy type
 * 一起删（C3）。⛔ 在那之前不要「顺手收紧」这里：收紧必须与**可见的拒绝理由**
 * 同批落地，否则就是退回静默失败那个坑。
 */
/* eslint-disable @typescript-eslint/no-unused-vars -- 参数留着是给三个 v3 调用方
   的类型契约，也是 C2 改接 `canConnect` 时的对照；恒真的函数体不读它们。 */
export function canConnectNodeTypes(
  source: NodeWorkflowNodeType,
  target: NodeWorkflowNodeType,
  targetRole?: NodeImageRole,
  sourceRole?: NodeImageRole,
): boolean {
  return true
}
/* eslint-enable @typescript-eslint/no-unused-vars */

/* ─────────────────────────────────────────────────────────────────────────
 * v4 · 具名槽连线规则（第三期 · 画布 C1，spec §3.3）
 *
 * 判据从「源类型 × 目标类型」换成「源 kind × (目标节点, 槽)」，端口表见
 * `src/constants/node-slots.ts`。恒真那条被 `canConnect` 取代，但兑现的是恒真
 * 注释开出的前提：**拒绝要有可见理由** —— 所以返回的不是 boolean 而是带
 * `reason` 的结果，拖线阶段用它决定点不点亮，落空时用它渲染那行 toast。
 * ───────────────────────────────────────────────────────────────────────── */

/** 连线的一端。只要三样东西：身份（kind/subtype）、id（查自环）、语义门用的 `blocked`。 */
export interface NodeConnectionEndpoint {
  readonly id: string
  readonly kind: NodeWorkflowMediaKind
  readonly subtype: NodeV4Subtype
  /**
   * 这个素材已被判失败（§3.3 语义门）。`image.shot` 带它时不能进 `firstFrame`，
   * 与「已在槽里的停用版不能设为当前」是同一条规则的两个出口。
   */
  readonly blocked?: boolean
}

export const NODE_CONNECT_REJECT_REASON_IDS = {
  /** 源和目标是同一个节点。 */
  selfLoop: 'selfLoop',
  /** 目标节点没有这个槽（`image.reference` 这类叶子源一个槽都没有）。 */
  unknownSlot: 'unknownSlot',
  /** 槽不收这个 kind。 */
  kindNotAllowed: 'kindNotAllowed',
  /** kind 对但子型不对（今天只有 `closeup` 有这道更窄的门）。 */
  subtypeNotAllowed: 'subtypeNotAllowed',
  /** 槽满了（静态 max 或调用方传进来的模型容量）。 */
  slotFull: 'slotFull',
  /** 语义门：该素材已判失败，不能作首帧。 */
  blockedSource: 'blockedSource',
} as const

export const NODE_CONNECT_REJECT_REASONS = [
  NODE_CONNECT_REJECT_REASON_IDS.selfLoop,
  NODE_CONNECT_REJECT_REASON_IDS.unknownSlot,
  NODE_CONNECT_REJECT_REASON_IDS.kindNotAllowed,
  NODE_CONNECT_REJECT_REASON_IDS.subtypeNotAllowed,
  NODE_CONNECT_REJECT_REASON_IDS.slotFull,
  NODE_CONNECT_REJECT_REASON_IDS.blockedSource,
] as const

export type NodeConnectRejectReason =
  (typeof NODE_CONNECT_REJECT_REASONS)[number]

export type NodeConnectResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: NodeConnectRejectReason }

export interface CanConnectOptions {
  /** 目标槽。**必填** —— 不带槽的连线在 v4 里不存在（spec §3.4 助手 `connect` 同款）。 */
  readonly slot: NodeSlotId
  /**
   * 该槽当前已占用几条边。轮播槽（max=1）传当前版本数：往已有内容的 0..1 槽再连
   * 一条**不是**超限，而是「加为新版本并设为当前」（§1.4），所以容量判据对
   * max=1 的槽不生效。
   */
  readonly occupancy?: number
  /**
   * 模型给的运行时容量（`resolveReferenceAssetLimit` / `getMaxReferenceImages`）。
   * 只对静态 `max === null` 的 0..N 槽有意义；不传 = 不设上限。
   */
  readonly capacity?: number
}

const VERSIONED_SLOT_CAPACITY = 1

/**
 * 这条边能不能建。**纯函数**，无 I/O、不看画布其余部分——调用方把已占用数与模型
 * 容量算好传进来。
 *
 * ⚠ 不判「这条边是不是已经存在」（重复边）与「会不会成环」：前者是调用方手上的
 * 边表的事，后者需要整张图。这里只回答「这一对端点 + 这个槽，规则上成立吗」。
 */
export function canConnect(
  source: NodeConnectionEndpoint,
  target: NodeConnectionEndpoint,
  options: CanConnectOptions,
): NodeConnectResult {
  if (source.id === target.id) {
    return { ok: false, reason: NODE_CONNECT_REJECT_REASON_IDS.selfLoop }
  }

  const spec = getNodeV4Slot(target.kind, target.subtype, options.slot)
  if (!spec) {
    return { ok: false, reason: NODE_CONNECT_REJECT_REASON_IDS.unknownSlot }
  }

  if (!spec.sourceKinds.includes(source.kind)) {
    return { ok: false, reason: NODE_CONNECT_REJECT_REASON_IDS.kindNotAllowed }
  }

  if (spec.sourceSubtypes && !spec.sourceSubtypes.includes(source.subtype)) {
    return {
      ok: false,
      reason: NODE_CONNECT_REJECT_REASON_IDS.subtypeNotAllowed,
    }
  }

  // 语义门（§3.3）：已判失败的素材不能作首/尾帧。规则薄卡在画布上的落地点。
  if (
    source.blocked === true &&
    (options.slot === NODE_SLOT_IDS.firstFrame ||
      options.slot === NODE_SLOT_IDS.lastFrame)
  ) {
    return { ok: false, reason: NODE_CONNECT_REJECT_REASON_IDS.blockedSource }
  }

  // 轮播槽不看容量：再连一条 = 加一个新版本（§1.4），不是超限。
  if (spec.max !== VERSIONED_SLOT_CAPACITY) {
    const limit = spec.max ?? options.capacity
    if (limit !== undefined && (options.occupancy ?? 0) >= limit) {
      return { ok: false, reason: NODE_CONNECT_REJECT_REASON_IDS.slotFull }
    }
  }

  return { ok: true }
}

/**
 * 从某个出口拖线时，目标节点上哪些槽该点亮（§3.4）。返回的是**合法槽列表**，
 * 顺序与端口表一致（= 画布上自上而下的顺序）。
 */
export function listConnectableSlots(
  source: NodeConnectionEndpoint,
  target: NodeConnectionEndpoint,
  options?: {
    readonly occupancyBySlot?: Partial<Record<NodeSlotId, number>>
    readonly capacityBySlot?: Partial<Record<NodeSlotId, number>>
  },
): NodeSlotId[] {
  const ports = getNodeV4Ports(target.kind, target.subtype)
  if (!ports) return []
  return ports.inputs
    .filter(
      (spec) =>
        canConnect(source, target, {
          slot: spec.slot,
          occupancy: options?.occupancyBySlot?.[spec.slot],
          capacity: options?.capacityBySlot?.[spec.slot],
        }).ok,
    )
    .map((spec) => spec.slot)
}
