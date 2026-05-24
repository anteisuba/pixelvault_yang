'use client'

import {
  useCallback,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type NodeTypes,
  type XYPosition,
} from '@xyflow/react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  NODE_STUDIO_CANVAS,
  NODE_STUDIO_NODE_PLACEMENT,
  NODE_STUDIO_PLACEHOLDER_TOAST,
  NODE_STUDIO_REACT_FLOW_PRO_OPTIONS,
} from '@/constants/node-studio'
import {
  NODE_TYPE_IDS,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import { useNodeWorkflow } from '@/hooks/use-node-workflow'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'

import { CanvasAddMenu } from './CanvasAddMenu'
import { CanvasAssistantToggle } from './CanvasAssistantToggle'
import { CanvasBottomDock } from './CanvasBottomDock'
import { CanvasMiniMap } from './CanvasMiniMap'
import { CanvasTopBar } from './CanvasTopBar'
import { NodeWorkflowActionsProvider } from './NodeWorkflowActionsContext'
import { ComposerNode } from './nodes/ComposerNode'

const NODE_COMPONENTS: NodeTypes = {
  [NODE_TYPE_IDS.composer]: ComposerNode,
}

interface AddMenuState {
  screenPosition: XYPosition
  flowPosition: XYPosition
}

export function StudioNodeWorkbench() {
  return (
    <section className="dark relative h-[calc(100vh-3rem)] min-h-[36rem] overflow-hidden bg-node-canvas text-node-foreground">
      <ReactFlowProvider>
        <StudioNodeCanvas />
      </ReactFlowProvider>
    </section>
  )
}

function StudioNodeCanvas() {
  const t = useTranslations('StudioNode')
  const workflow = useNodeWorkflow()
  const { screenToFlowPosition } = useReactFlow<
    NodeWorkflowNode,
    NodeWorkflowEdge
  >()
  const [addMenu, setAddMenu] = useState<AddMenuState | null>(null)

  const workflowActions = useMemo(
    () => ({
      updateNodeData: workflow.updateNodeData,
      deleteNode: workflow.deleteNode,
    }),
    [workflow.deleteNode, workflow.updateNodeData],
  )

  const closeAddMenu = useCallback(() => {
    setAddMenu(null)
  }, [])

  const openAddMenu = useCallback(
    (screenPosition: XYPosition, flowPosition: XYPosition) => {
      setAddMenu({
        screenPosition,
        flowPosition,
      })
    },
    [],
  )

  const handleTopbarAddClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      const rect = event.currentTarget.getBoundingClientRect()
      openAddMenu(
        {
          x: rect.left,
          y: rect.bottom + NODE_STUDIO_NODE_PLACEMENT.menuOffset.y,
        },
        NODE_STUDIO_NODE_PLACEMENT.topbarAddPosition,
      )
    },
    [openAddMenu],
  )

  const handlePaneContextMenu = useCallback(
    (event: ReactMouseEvent<Element> | MouseEvent) => {
      event.preventDefault()
      const screenPosition = {
        x: event.clientX,
        y: event.clientY,
      }

      openAddMenu(screenPosition, screenToFlowPosition(screenPosition))
    },
    [openAddMenu, screenToFlowPosition],
  )

  const handleAddNode = useCallback(
    (type: NodeWorkflowNodeType) => {
      if (!addMenu) {
        return
      }

      workflow.addNode(type, addMenu.flowPosition)
      closeAddMenu()
    },
    [addMenu, closeAddMenu, workflow],
  )

  const handleNodesDelete = useCallback(
    (nodes: NodeWorkflowNode[]) => {
      if (nodes.length === 0) {
        return
      }

      toast.info(t('toasts.nodesDeleted', { count: nodes.length }), {
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
    },
    [t],
  )

  return (
    <>
      <NodeWorkflowActionsProvider value={workflowActions}>
        <ReactFlow
          nodes={workflow.nodes}
          edges={workflow.edges}
          nodeTypes={NODE_COMPONENTS}
          onNodesChange={workflow.onNodesChange}
          onEdgesChange={workflow.onEdgesChange}
          onConnect={workflow.onConnect}
          onPaneClick={closeAddMenu}
          onPaneContextMenu={handlePaneContextMenu}
          onNodesDelete={handleNodesDelete}
          deleteKeyCode={['Backspace', 'Delete']}
          defaultViewport={NODE_STUDIO_CANVAS.defaultViewport}
          proOptions={NODE_STUDIO_REACT_FLOW_PRO_OPTIONS}
          nodesDraggable
          nodesConnectable
          elementsSelectable
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
      </NodeWorkflowActionsProvider>

      <div className="pointer-events-none absolute inset-0 z-10">
        <CanvasTopBar
          nodeCount={workflow.nodes.length}
          onAddClick={handleTopbarAddClick}
        />
        <CanvasAssistantToggle />
        <CanvasBottomDock />
        <CanvasAddMenu
          open={Boolean(addMenu)}
          screenPosition={addMenu?.screenPosition ?? null}
          onSelect={handleAddNode}
          onClose={closeAddMenu}
        />
      </div>
    </>
  )
}
