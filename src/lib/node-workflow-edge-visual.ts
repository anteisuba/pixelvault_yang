/**
 * Edge visual state resolver (canvas-baseline §2.3 / §6, draft C).
 *
 * Edges are neutral: default / hover / selected / running differ by BRIGHTNESS,
 * never hue (the only colored edge state is an illegal connection = red, handled
 * by ReactFlow's connection line, not here). "Running" = the edge feeds a node
 * that is generating; it gets the bright stroke plus a neutral pulse.
 *
 * Pure + React-free so the 4-state precedence is unit-testable in isolation.
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
  selected: boolean
  hovered: boolean
}

export interface EdgeVisual {
  /** CSS color token for the stroke (neutral; brightness conveys state). */
  color: string
  strokeWidth: number
  /** Whether to attach the neutral-pulse animation class. */
  pulsing: boolean
}

/**
 * Resolve an edge's stroke from its state. Any active state (running / selected
 * / hovered) lifts the stroke to the bright neutral; selection also thickens it;
 * only running pulses.
 */
export function resolveNodeWorkflowEdgeVisual({
  running,
  selected,
  hovered,
}: EdgeVisualInputs): EdgeVisual {
  const active = running || selected || hovered
  return {
    color: active ? 'var(--node-edge-active)' : 'var(--node-edge)',
    strokeWidth: selected
      ? NODE_STUDIO_EDGE_VISUALS.strokeWidth + 0.5
      : NODE_STUDIO_EDGE_VISUALS.strokeWidth,
    pulsing: running,
  }
}
