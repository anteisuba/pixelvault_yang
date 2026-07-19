/**
 * Multi-select "一键成盒" eligibility + initial ordering (canvas-relationship
 * -v3 §3.0b/§7 R3-7, docs/plans/canvas-relationship-v3-2026-07.md). Pure
 * functions only — no React, no ReactFlow store reads — so the toolbar's
 * "should the 合成 entry render" gate and the compose handler's "which order
 * do the new edges get built in" logic are unit-testable in isolation from
 * the workbench wiring that calls them.
 */

import {
  NODE_TYPE_IDS,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import { NODE_CONNECTION_RULES } from '@/lib/node-connection-rules'

/** The exact set of source types a `videoMerge` node's connection-matrix row
 *  already accepts (`node-connection-rules.ts`) — reused, not duplicated, so
 *  "入盒标准即现有连接矩阵不改" (§3.0b) stays a single definition. */
const VIDEO_MERGE_SOURCE_TYPES = new Set<NodeWorkflowNodeType>(
  NODE_CONNECTION_RULES[NODE_TYPE_IDS.videoMerge] ?? [],
)

/** True for seedance / videoReference / videoMerge — the only node types a
 *  `videoMerge` node can legally receive an edge from today. */
export function isVideoMergeSourceNodeType(
  type: NodeWorkflowNodeType | undefined,
): boolean {
  return type !== undefined && VIDEO_MERGE_SOURCE_TYPES.has(type)
}

const MIN_COMPOSE_SELECTION = 2

/**
 * §3.0b "多选视频类节点 → 出现「合成」入口": true only when 2+ nodes are
 * selected AND every single one of them is a legal videoMerge source type.
 * A lone non-video node anywhere in the selection makes this false — the
 * caller's contract is "entry does not render at all", not "renders
 * disabled" (task red line).
 */
export function canComposeVideoMergeSelection(
  nodes: readonly { type?: NodeWorkflowNodeType }[],
): boolean {
  return (
    nodes.length >= MIN_COMPOSE_SELECTION &&
    nodes.every((node) => isVideoMergeSourceNodeType(node.type))
  )
}

/**
 * §7 R3-7 "顺序说明": the initial ingest order when a fresh videoMerge node
 * is auto-built from a multi-selection is x-ascending spatial reading order,
 * y as the tiebreak (two nodes stacked at the same x read top-to-bottom).
 * Pure sort — does not mutate `nodes` — the caller decides what to do with
 * the ordering (e.g. build edges in this sequence).
 */
export function sortNodesForVideoMergeCompose<
  T extends { position: { x: number; y: number } },
>(nodes: readonly T[]): T[] {
  return [...nodes].sort((a, b) => {
    if (a.position.x !== b.position.x) return a.position.x - b.position.x
    return a.position.y - b.position.y
  })
}
