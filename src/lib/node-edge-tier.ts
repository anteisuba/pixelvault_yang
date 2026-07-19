/**
 * Two-tier edge classification (canvas-relationship-v3 §2.1,
 * docs/plans/canvas-relationship-v3-2026-07.md). Pure lookup on
 * (sourceType/sourceRole → targetType), same layer + test style as
 * `node-connection-rules.ts` (which governs edge LEGALITY; this governs
 * render TIER only — a purely additive read on top of already-legal edges,
 * never the other way around).
 *
 * Backbone = the production mainline (制片流): a shot image feeding a video,
 * a video referencing another video, and any video source draining into the
 * merge bin. Everything else a legal edge can carry (character/background
 * reference, voice donor, video reference, closeup, script text, loose
 * image, …) is an ingredient — a supply relationship the 成分栏 chip already
 * narrates, only drawn on the canvas when its node is selected.
 */

import { NODE_IMAGE_ROLE_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'

export const NODE_EDGE_TIER_IDS = {
  backbone: 'backbone',
  ingredient: 'ingredient',
} as const

export type NodeEdgeTier =
  (typeof NODE_EDGE_TIER_IDS)[keyof typeof NODE_EDGE_TIER_IDS]

/** A shot image (镜头图) — legacy `shot` type OR unified `image` role=shot. */
function isShotImageNode(node: NodeWorkflowNode): boolean {
  return (
    node.type === NODE_TYPE_IDS.shot ||
    (node.type === NODE_TYPE_IDS.image &&
      node.data.role === NODE_IMAGE_ROLE_IDS.shot)
  )
}

/**
 * Classify an edge as `backbone` (制片流，常显) or `ingredient` (供给关系，
 * 默认藏进成分栏，选中显现). §2.1 collapses the full table to two rules:
 *
 *   - target === videoMerge → backbone (成片进片盒)
 *   - target === seedance && source ∈ {seedance, 镜头图} → backbone
 *     (前片引用 reference-to-video / 静帧先审再喂)
 *
 * Every other legal pairing (character/background/voice/videoReference/
 * closeup/shotText/loose image → anything) is `ingredient`. The `edge`
 * argument is accepted for signature symmetry with the render-tier call
 * sites (and room for a future edge-level override) — today the classifier
 * is a pure function of the two endpoint nodes.
 */
export function resolveNodeEdgeTier(
  edge: NodeWorkflowEdge,
  sourceNode: NodeWorkflowNode,
  targetNode: NodeWorkflowNode,
): NodeEdgeTier {
  void edge

  if (targetNode.type === NODE_TYPE_IDS.videoMerge) {
    return NODE_EDGE_TIER_IDS.backbone
  }

  if (
    targetNode.type === NODE_TYPE_IDS.seedance &&
    (sourceNode.type === NODE_TYPE_IDS.seedance || isShotImageNode(sourceNode))
  ) {
    return NODE_EDGE_TIER_IDS.backbone
  }

  return NODE_EDGE_TIER_IDS.ingredient
}

export interface NodeEdgeVisibilityInputs {
  tier: NodeEdgeTier
  /** Either endpoint node is currently selected (§2.2 row②，marquee union included). */
  endpointSelected: boolean
  /** The edge's target node is generating (§2.2 row③，forces a pulse regardless of tier). */
  targetGenerating: boolean
  /**
   * The bottom-dock「关系线」toggle (§2.5, FB-B 真机反馈后 owner 反转默认) is
   * in its **收起** state. Default (`false`) = 全显：every two-ends-visible
   * edge (骨干 + 成分) renders, ingredient edges at the neutral stroke unless
   * `endpointSelected` upgrades them to the 石绿 "revealed" tint elsewhere.
   * `true` = 收起：falls back to the old default — backbone always shown,
   * ingredient only when selected or its target is generating.
   */
  relationsCollapsed: boolean
}

/**
 * §2.2 渲染条件矩阵's "两端可见前提下，这条边该不该画" boolean — extracted out
 * of `StudioNodeWorkbench`'s `renderedEdges` memo (R3-2,
 * canvas-relationship-v3-2026-07.md §2.7/§2.8) so it has ONE definition
 * shared by three call sites that all need the exact same answer: the memo
 * itself, the pre-delete "is this edge currently rendered" check that decides
 * whether an unbind gets the 墨线反向褪去 treatment, and the 墨线签署 hold
 * window's "will this edge still qualify once the grace period ends" check.
 * Pure — the caller supplies the two-ends-visible guard and the signing/
 * unsigning render-layer overrides separately; this function only knows the
 * four §2.2 conditions.
 *
 * FB-B（真机反馈，canvas-relationship-v3-2026-07 §2.2 反转）: owner 拍板把
 * 「选中才显」的默认改成「默认全显 + 开关可收」。骨干边永远显示；不收起
 * (`relationsCollapsed === false`, 会话默认) 时成分边也全部显示；收起后成
 * 分边收窄回旧默认——只在其端点被选中或目标正在生成时才显示。
 */
export function resolveNodeEdgeVisibility({
  tier,
  endpointSelected,
  targetGenerating,
  relationsCollapsed,
}: NodeEdgeVisibilityInputs): boolean {
  if (tier === NODE_EDGE_TIER_IDS.backbone) return true
  if (!relationsCollapsed) return true
  return endpointSelected || targetGenerating
}

/** Identity key for a (source→target) edge pair — duplicates are rejected by
 *  `evaluateCastIngest` before a connect ever happens, so this uniquely
 *  addresses "the edge just created between these two nodes" without needing
 *  its generated id (R3-2's 墨线签署 bookkeeping keys off this, not edge.id,
 *  because the caller that schedules the signing animation only knows source/
 *  target, not the id `onConnect` mints internally). */
export function edgePairKey(source: string, target: string): string {
  return `${source}::${target}`
}
