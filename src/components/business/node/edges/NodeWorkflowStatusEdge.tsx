'use client'

import { memo, useEffect, useRef, useState } from 'react'
import { getBezierPath, useNodesData, type EdgeProps } from '@xyflow/react'

import { NODE_STUDIO_EDGE_VISUALS } from '@/constants/node-studio'
import {
  playInkSignAnimation,
  playInkUnsignAnimation,
} from '@/hooks/node/use-cast-ingest'
import { cn } from '@/lib/utils'
import {
  isNodeWorkflowGenerating,
  resolveNodeWorkflowEdgeVisual,
} from '@/lib/node-workflow-edge-visual'
import type { NodeWorkflowNode } from '@/types/node-workflow'

/**
 * Canvas edge with the two-tier "墨线" system — default(骨干常显) / hover /
 * revealed(成分显现，石绿) / selected(边自身选中，石绿) / running — expressed
 * as brightness on a neutral stroke, except the two 石绿 states (revealed /
 * selected, node-canvas.md §5 落点③). "Running" tracks the target node's
 * generation status and wins over every other state, adding a neutral pulse
 * (`.node-canvas-edge-running`). Registered as `smoothstep` so it
 * transparently replaces ReactFlow's built-in for every canvas edge — that
 * registration key is just the `edgeTypes` map lookup, unrelated to the
 * actual curve shape: A2 (canvas-relationship-v3-2026-07 §7b, owner
 * 2026-07-18 real-device feedback — the smoothstep's right-angle bends read
 * as "not a curve") swaps the path generator from `getSmoothStepPath` to
 * `getBezierPath`, nothing else. Every consumer below (hit-area path, hover,
 * the signing `pathRef`/`getTotalLength()` draw-in, the target-end dot) only
 * ever touches the resulting `d` string, so this is a pure drop-in — same
 * params in, same `[path, labelX, labelY, offsetX, offsetY]` tuple shape out.
 *
 * §2.4 retires the arrowhead marker along with the port dots — direction
 * reads from the card anatomy (input left, output right) instead. In its
 * place, a small dot lands on the target end, coloured to match the current
 * stroke — the only "端标" this edge draws now.
 *
 * R3-2「墨线签署/褪去」(canvas-relationship-v3 §2.7): renders its own `<path>`
 * instead of `<BaseEdge>` so it can hold a `ref` for `getTotalLength()` — the
 * stroke-dashoffset draw-in/retreat needs the path's real measured length,
 * not a static keyframe table. `data.justSigned` / `data.signingFadeOut` /
 * `data.unsigning` are all render-layer-only markers stamped by
 * `StudioNodeWorkbench`'s `renderedEdges` memo — never persisted (same
 * discipline as `data.revealed`). The two-phase timing itself (draw → hold →
 * settle-fade) is owned entirely by the workbench's timers, NOT by this
 * component — it only ever reacts to the two booleans it's handed, so it
 * never needs to reset its own state (which would trip
 * `react-hooks/set-state-in-effect`; playing a WAAPI animation is a plain
 * imperative call, not a React state write, so that's the only thing these
 * effects do).
 */
export const NodeWorkflowStatusEdge = memo(function NodeWorkflowStatusEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  target,
  selected,
  data,
}: EdgeProps) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })
  const [hovered, setHovered] = useState(false)
  const pathRef = useRef<SVGPathElement | null>(null)

  const targetData = useNodesData<NodeWorkflowNode>(target)
  const running = isNodeWorkflowGenerating(
    targetData?.data.status,
    targetData?.data.generationStatus,
  )
  // Set by StudioNodeWorkbench's renderedEdges memo — true for a selection-
  // revealed ingredient edge AND for the whole 墨线签署 hold window (both
  // ride the same 石绿 tint).
  const revealed = Boolean(data?.revealed)
  // True only for the draw-in sub-phase (StudioNodeWorkbench's `'drawing'`
  // phase) — the rising edge triggers the dash-in once.
  const justSigned = Boolean(data?.justSigned)
  // True only for the settle sub-phase, and only when the workbench has
  // already determined the edge won't otherwise qualify to stay visible —
  // computed fresh every workbench render, so it self-cancels the instant
  // the user selects the node mid-window instead of needing an explicit
  // "undo the fade" action here.
  const signingFadeOut = Boolean(data?.signingFadeOut)
  const unsigning = Boolean(data?.unsigning)

  // Ink draw-in: plays once per signing episode (rising edge of `justSigned`).
  useEffect(() => {
    if (!justSigned) return
    playInkSignAnimation(pathRef.current)
  }, [justSigned])

  // Reverse ink retreat: plays once while StudioNodeWorkbench keeps a doomed
  // edge's snapshot alive in the render array for exactly this long after the
  // real edge is already gone from `workflow.edges`.
  useEffect(() => {
    if (!unsigning) return
    playInkUnsignAnimation(pathRef.current)
  }, [unsigning])

  const visual = resolveNodeWorkflowEdgeVisual({
    running,
    selected: Boolean(selected),
    revealed,
    hovered,
  })

  return (
    <>
      {/* Wide transparent hit area so the thin path is easy to hover/select. */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={NODE_STUDIO_EDGE_VISUALS.interactionWidth}
        className="react-flow__edge-interaction"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />
      <path
        ref={pathRef}
        d={path}
        fill="none"
        className={cn(
          'react-flow__edge-path',
          running && 'node-canvas-edge-running',
          signingFadeOut && 'node-canvas-edge-signing-fade-out',
        )}
        style={{
          stroke: visual.color,
          strokeWidth: visual.strokeWidth,
        }}
      />
      <circle
        cx={targetX}
        cy={targetY}
        r={NODE_STUDIO_EDGE_VISUALS.endDotRadius}
        fill={visual.color}
        stroke="none"
        className={cn(
          'pointer-events-none',
          signingFadeOut && 'node-canvas-edge-signing-fade-out',
        )}
      />
    </>
  )
})
