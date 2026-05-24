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
  ConnectionLineType,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type DefaultEdgeOptions,
  type NodeTypes,
  type XYPosition,
} from '@xyflow/react'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  NODE_STUDIO_CANVAS,
  NODE_STUDIO_EDGE_VISUALS,
  NODE_STUDIO_NODE_PLACEMENT,
  NODE_STUDIO_PLACEHOLDER_TOAST,
  NODE_STUDIO_REACT_FLOW_PRO_OPTIONS,
} from '@/constants/node-studio'
import {
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import {
  DEFAULT_SCRIPT_PLANNER_PROVIDER,
  SCRIPT_BREAKDOWN_ERROR_CODES,
  SCRIPT_BREAKDOWN_QUICK_SETUP_OPTION_PREFIX,
  SCRIPT_PLANNER_MODELS,
} from '@/constants/script-breakdown'
import { DEFAULT_LOCALE, isAppLocale } from '@/i18n/routing'
import { useNodeWorkflow } from '@/hooks/use-node-workflow'
import { useScriptBreakdown } from '@/hooks/use-script-breakdown'
import { QuickSetupDialog } from '@/components/business/studio/QuickSetupDialog'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'

import { CanvasAddMenu } from './CanvasAddMenu'
import { CanvasAssistantToggle } from './CanvasAssistantToggle'
import { CanvasBottomDock } from './CanvasBottomDock'
import { CanvasMiniMap } from './CanvasMiniMap'
import { CanvasTopBar } from './CanvasTopBar'
import type { NodePlannerRouteSelection } from './CanvasPlannerRouteSelector'
import { NodeWorkflowActionsProvider } from './NodeWorkflowActionsContext'
import { AgentNode } from './nodes/AgentNode'
import { ComposerNode } from './nodes/ComposerNode'

const NODE_COMPONENTS: NodeTypes = {
  [NODE_TYPE_IDS.composer]: ComposerNode,
  [NODE_TYPE_IDS.agent]: AgentNode,
}

const NODE_STUDIO_DEFAULT_EDGE_OPTIONS: DefaultEdgeOptions = {
  type: NODE_STUDIO_EDGE_VISUALS.type,
  interactionWidth: NODE_STUDIO_EDGE_VISUALS.interactionWidth,
  markerEnd: {
    type: NODE_STUDIO_EDGE_VISUALS.markerEndType,
    color: NODE_STUDIO_EDGE_VISUALS.color,
    width: NODE_STUDIO_EDGE_VISUALS.markerSize,
    height: NODE_STUDIO_EDGE_VISUALS.markerSize,
    strokeWidth: NODE_STUDIO_EDGE_VISUALS.markerStrokeWidth,
  },
  style: {
    stroke: NODE_STUDIO_EDGE_VISUALS.color,
    strokeWidth: NODE_STUDIO_EDGE_VISUALS.strokeWidth,
    filter: NODE_STUDIO_EDGE_VISUALS.glowFilter,
  },
}

const NODE_STUDIO_CONNECTION_LINE_STYLE = {
  stroke: NODE_STUDIO_EDGE_VISUALS.previewColor,
  strokeWidth: NODE_STUDIO_EDGE_VISUALS.previewStrokeWidth,
  strokeDasharray: NODE_STUDIO_EDGE_VISUALS.previewDash,
  filter: NODE_STUDIO_EDGE_VISUALS.glowFilter,
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
  const locale = useLocale()
  const workflow = useNodeWorkflow()
  const scriptBreakdown = useScriptBreakdown()
  const { screenToFlowPosition } = useReactFlow<
    NodeWorkflowNode,
    NodeWorkflowEdge
  >()
  const [addMenu, setAddMenu] = useState<AddMenuState | null>(null)
  const [plannerRoute, setPlannerRoute] =
    useState<NodePlannerRouteSelection | null>(null)
  const [quickSetupOpen, setQuickSetupOpen] = useState(false)

  const appLocale = isAppLocale(locale) ? locale : DEFAULT_LOCALE

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

  const handleSendFromComposer = useCallback(
    async (composerNodeId: string) => {
      const composerNode = workflow.nodes.find(
        (node) => node.id === composerNodeId,
      )
      const idea = composerNode?.data.prompt.trim() ?? ''

      if (!idea) {
        toast.info(t('composer.emptyPromptTip'), {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
        return
      }

      const targetAgent = workflow.getOutgoingTargetByType(
        composerNodeId,
        NODE_TYPE_IDS.agent,
      )

      if (!targetAgent) {
        toast.info(t('composer.noTargetTip'), {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
        return
      }

      workflow.updateNodeData(composerNodeId, {
        status: NODE_STATUS_IDS.running,
      })
      workflow.updateNodeData(targetAgent.id, {
        generationError: undefined,
        status: NODE_STATUS_IDS.running,
      })

      const result = await scriptBreakdown.generate({
        idea,
        plannerProvider:
          plannerRoute?.plannerProvider ?? DEFAULT_SCRIPT_PLANNER_PROVIDER,
        ...(plannerRoute?.apiKeyId ? { apiKeyId: plannerRoute.apiKeyId } : {}),
        locale: appLocale,
      })

      if (result.success) {
        workflow.updateScriptBreakdown(
          targetAgent.id,
          result.data.breakdown,
          result.data.planner,
        )
        workflow.updateNodeData(composerNodeId, {
          status: NODE_STATUS_IDS.done,
        })
        toast.success(t('toasts.generated'), {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
        return
      }

      workflow.updateNodeData(composerNodeId, {
        status: NODE_STATUS_IDS.failed,
      })
      workflow.updateNodeData(targetAgent.id, {
        generationError: result.error,
        status: NODE_STATUS_IDS.failed,
      })

      if (result.errorCode === SCRIPT_BREAKDOWN_ERROR_CODES.missingApiKey) {
        setQuickSetupOpen(true)
      }

      toast.error(t('toasts.scriptBreakdownFailed'), {
        description: result.error,
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
    },
    [appLocale, plannerRoute, scriptBreakdown, t, workflow],
  )

  const workflowActions = useMemo(
    () => ({
      updateNodeData: workflow.updateNodeData,
      updateScriptBreakdown: workflow.updateScriptBreakdown,
      deleteNode: workflow.deleteNode,
      sendFromComposer: handleSendFromComposer,
    }),
    [
      handleSendFromComposer,
      workflow.deleteNode,
      workflow.updateNodeData,
      workflow.updateScriptBreakdown,
    ],
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
          defaultEdgeOptions={NODE_STUDIO_DEFAULT_EDGE_OPTIONS}
          connectionLineType={ConnectionLineType.SmoothStep}
          connectionLineStyle={NODE_STUDIO_CONNECTION_LINE_STYLE}
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
          plannerRoute={plannerRoute}
          onPlannerRouteChange={setPlannerRoute}
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
      <QuickSetupDialog
        open={quickSetupOpen}
        onOpenChange={setQuickSetupOpen}
        modelId={SCRIPT_PLANNER_MODELS.gemini.modelId}
        modelLabel={SCRIPT_PLANNER_MODELS.gemini.label}
        adapterType={AI_ADAPTER_TYPES.GEMINI}
        optionId={`${SCRIPT_BREAKDOWN_QUICK_SETUP_OPTION_PREFIX}:${SCRIPT_PLANNER_MODELS.gemini.modelId}`}
      />
    </>
  )
}
