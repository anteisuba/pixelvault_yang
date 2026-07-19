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
}

export interface EdgeVisual {
  /** CSS color token for the stroke. */
  color: string
  strokeWidth: number
  /** Whether to attach the neutral-pulse animation class. */
  pulsing: boolean
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
}: EdgeVisualInputs): EdgeVisual {
  if (running) {
    return {
      color: NODE_STUDIO_EDGE_VISUALS.previewColor,
      strokeWidth: NODE_STUDIO_EDGE_VISUALS.strokeWidth,
      pulsing: true,
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
