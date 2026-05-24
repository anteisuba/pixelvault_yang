'use client'

import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
} from '@xyflow/react'

import {
  NODE_STUDIO_CANVAS,
  NODE_STUDIO_REACT_FLOW_PRO_OPTIONS,
} from '@/constants/node-studio'

import { CanvasAssistantToggle } from './CanvasAssistantToggle'
import { CanvasBottomDock } from './CanvasBottomDock'
import { CanvasMiniMap } from './CanvasMiniMap'
import { CanvasTopBar } from './CanvasTopBar'

const EMPTY_NODES: Node[] = []
const EMPTY_EDGES: Edge[] = []

export function StudioNodeWorkbench() {
  return (
    <section className="dark relative h-[calc(100vh-3rem)] min-h-[36rem] overflow-hidden bg-node-canvas text-node-foreground">
      <ReactFlowProvider>
        <ReactFlow
          nodes={EMPTY_NODES}
          edges={EMPTY_EDGES}
          defaultViewport={NODE_STUDIO_CANVAS.defaultViewport}
          proOptions={NODE_STUDIO_REACT_FLOW_PRO_OPTIONS}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnScroll
          fitView={false}
          className="bg-node-canvas"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={NODE_STUDIO_CANVAS.background.gap}
            size={NODE_STUDIO_CANVAS.background.size}
            color={NODE_STUDIO_CANVAS.background.color}
          />
          <CanvasMiniMap />
        </ReactFlow>

        <div className="pointer-events-none absolute inset-0 z-10">
          <CanvasTopBar nodeCount={EMPTY_NODES.length} />
          <CanvasAssistantToggle />
          <CanvasBottomDock />
        </div>
      </ReactFlowProvider>
    </section>
  )
}
