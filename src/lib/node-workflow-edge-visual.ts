/**
 * Edge visual state resolver (canvas-baseline §2.3 / §6, draft C; extended by
 * canvas-relationship-v3 §2.3 R3-1 for the two-tier "墨线" system).
 *
 * A backbone edge's default state is neutral (brightness-only, never hue) —
 * the only colored states are `revealed` (an ingredient edge shown because an
 * endpoint node is selected) and `selected` (the edge itself is selected),
 * both of which ride the room's single 石绿 accent (node-canvas.md §5 落点③
 * "selected"). "Running" = the edge feeds a node that is generating; it wins
 * over every other state and pulses.
 *
 * Precedence: running > selected > revealed > hover > default. Pure +
 * React-free so it's unit-testable in isolation.
 */

import { NODE_TYPE_IDS } from '@/constants/node-types'
import {
  NODE_GENERATION_STATUS_IDS,
  NODE_STATUS_IDS,
} from '@/constants/node-types'
import { NODE_STUDIO_EDGE_VISUALS } from '@/constants/node-studio'

/** A node is "generating" when its run status or generation status is active. */
export function isNodeWorkflowGenerating(
  status: string | undefined,
  generationStatus: string | undefined,
): boolean {
  return (
    status === NODE_STATUS_IDS.running ||
    generationStatus === NODE_GENERATION_STATUS_IDS.pending
  )
}

export interface EdgeVisualInputs {
  running: boolean
  /** The edge itself is selected (clicked) — Del/Backspace unbinds it. */
  selected: boolean
  /**
   * An ingredient edge made visible because one of its endpoint nodes is
   * currently selected (§2.2 "显现") — NOT set for a backbone edge (always
   * visible already) or for the "关系线" global toggle (neutral, not tinted).
   */
  revealed: boolean
  hovered: boolean
  /**
   * S3（2026-07-26）：源节点还没产出媒体 —— 这条关系「已连上但还不成立」。
   * 规格 §7.1 把虚实定为「就绪与否」的编码位：实线 = 已建立，虚线 = 未就绪。
   * 参考站也是这么用的（原判"虚线是装饰"已更正）。
   * 可选：不传 = 当作已建立（实线）。既有调用方不用改。
   */
  pending?: boolean
}

export interface EdgeVisual {
  /** CSS color token for the stroke. */
  color: string
  strokeWidth: number
  /** Whether to attach the neutral-pulse animation class. */
  pulsing: boolean
  /** 未就绪档的虚线节奏；已建立档为 undefined（实线）。 */
  dashArray?: string
  /** 未就绪档降透明——它是弱信息，允许弱。 */
  opacity?: number
}

/**
 * Resolve an edge's stroke from its state, precedence running > selected >
 * revealed > hover > default (§2.3). Only `running` pulses; `revealed` /
 * `selected` are the two 石绿-tinted states, everything else is neutral
 * brightness.
 */
export function resolveNodeWorkflowEdgeVisual({
  running,
  selected,
  revealed,
  hovered,
  pending,
}: EdgeVisualInputs): EdgeVisual {
  // 未就绪排在 running 之后、其它之前：源节点正在生成时仍走 running 的脉冲
  // （那是"正在发生"，比"还没就绪"更该被看见）；一旦不在生成，没产出就是虚线。
  if (running) {
    return {
      color: NODE_STUDIO_EDGE_VISUALS.previewColor,
      strokeWidth: NODE_STUDIO_EDGE_VISUALS.strokeWidth,
      pulsing: true,
    }
  }
  if (pending) {
    return {
      color: NODE_STUDIO_EDGE_VISUALS.color,
      strokeWidth: NODE_STUDIO_EDGE_VISUALS.pendingStrokeWidth,
      pulsing: false,
      dashArray: NODE_STUDIO_EDGE_VISUALS.pendingDashArray,
      opacity: NODE_STUDIO_EDGE_VISUALS.pendingOpacity,
    }
  }
  if (selected) {
    return {
      color: NODE_STUDIO_EDGE_VISUALS.selectedColor,
      strokeWidth: NODE_STUDIO_EDGE_VISUALS.selectedStrokeWidth,
      pulsing: false,
    }
  }
  if (revealed) {
    return {
      color: NODE_STUDIO_EDGE_VISUALS.revealedColor,
      strokeWidth: NODE_STUDIO_EDGE_VISUALS.revealedStrokeWidth,
      pulsing: false,
    }
  }
  if (hovered) {
    return {
      color: NODE_STUDIO_EDGE_VISUALS.previewColor,
      strokeWidth: NODE_STUDIO_EDGE_VISUALS.hoverStrokeWidth,
      pulsing: false,
    }
  }
  return {
    color: NODE_STUDIO_EDGE_VISUALS.color,
    strokeWidth: NODE_STUDIO_EDGE_VISUALS.strokeWidth,
    pulsing: false,
  }
}

/**
 * S3：判定一条边的**源**是否还没产出，用来决定这条关系画实线还是虚线。
 *
 * 只把「会产媒体」的类型算进来：身份卡 / 音色卡这些本来就不带 `mediaUrl`，
 * 一律当未就绪会让整张画布全是虚线，虚实这个编码位就废了。
 * ⚠ 这是首版判据，真机上要盯一眼「刚上传完图的散图卡」这类会不会误判。
 */
const MEDIA_PRODUCING_NODE_TYPES: ReadonlySet<string> = new Set([
  NODE_TYPE_IDS.image,
  NODE_TYPE_IDS.shot,
  NODE_TYPE_IDS.characterImage,
  NODE_TYPE_IDS.backgroundImage,
  NODE_TYPE_IDS.frameImage,
  NODE_TYPE_IDS.seedance,
  NODE_TYPE_IDS.videoReference,
  NODE_TYPE_IDS.videoMerge,
])

export function isPendingSourceNode(
  node: { type?: string; data?: { mediaUrl?: unknown } } | null | undefined,
): boolean {
  if (!node?.type) return false
  if (!MEDIA_PRODUCING_NODE_TYPES.has(node.type)) return false
  const url = node.data?.mediaUrl
  return typeof url !== 'string' || url.length === 0
}
