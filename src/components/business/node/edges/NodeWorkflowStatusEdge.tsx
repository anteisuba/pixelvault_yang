'use client'

import { useState } from 'react'
import {
  BaseEdge,
  getSmoothStepPath,
  useNodesData,
  type EdgeProps,
} from '@xyflow/react'

import { NODE_STUDIO_EDGE_VISUALS } from '@/constants/node-studio'
import {
  isNodeWorkflowGenerating,
  resolveNodeWorkflowEdgeVisual,
} from '@/lib/node-workflow-edge-visual'
import type { NodeWorkflowNode } from '@/types/node-workflow'

/**
 * Canvas edge with the §2.3 four-state system — default / hover / selected /
 * running — expressed purely through brightness on a neutral stroke (no hue).
 * "Running" tracks the target node's generation status and adds a neutral pulse
 * (`.node-canvas-edge-running`). Registered as `smoothstep` so it transparently
 * replaces ReactFlow's built-in for every canvas edge (all are smoothstep).
 */
export function NodeWorkflowStatusEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  target,
  selected,
  markerEnd,
}: EdgeProps) {
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })
  const [hovered, setHovered] = useState(false)

  const targetData = useNodesData<NodeWorkflowNode>(target)
  const running = isNodeWorkflowGenerating(
    targetData?.data.status,
    targetData?.data.generationStatus,
  )

  const visual = resolveNodeWorkflowEdgeVisual({
    running,
    selected: Boolean(selected),
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
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        className={running ? 'node-canvas-edge-running' : undefined}
        style={{
          stroke: visual.color,
          strokeWidth: visual.strokeWidth,
          filter: NODE_STUDIO_EDGE_VISUALS.glowFilter,
        }}
      />
    </>
  )
}
