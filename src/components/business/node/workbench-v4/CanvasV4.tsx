'use client'

/**
 * v4 原生的 ReactFlow 画布（第三期 · 画布 C3c-③d-3「写好不接」）。
 *
 * ⛔ 生产调用方为 0 —— 接线在 ③d-4。
 *
 * ── 与 `StudioNodeWorkbench` 那块画布的差别 ─────────────────────────────
 * 那边的节点是 v4、但**图仍是 v3 引擎**在管（`workflow.onNodesChange` /
 * `workflow.onConnect` 读写 v3 视图）。这里整条换成 v4：节点来自
 * `useNodeGraphV4().rfNodes`，边由 v4 的 `kind`/`subtype`/`status` 分档
 * （`resolveNodeEdgeTierV4`）并走同一张可见性矩阵（`resolveNodeEdgeVisibility`）。
 *
 * ⚠ 目标 handle 就是**槽 id**：`NodeV4Shell` 按端口表逐槽渲染 `Handle id={slot}`，
 * 所以边的 `targetHandle` 直接写 `edge.slot`，⛔ 不另发明一套 handle 命名。
 */

import { useCallback, useMemo } from 'react'
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  ReactFlow,
  SelectionMode,
  type DefaultEdgeOptions,
  type EdgeTypes,
  type IsValidConnection,
  type NodeChange,
  type NodeMouseHandler,
} from '@xyflow/react'

import {
  NODE_STUDIO_CANVAS,
  NODE_STUDIO_REACT_FLOW_PRO_OPTIONS,
  NODE_STUDIO_TOOL_MODE_IDS,
  type NodeStudioToolMode,
} from '@/constants/node-studio'
import { NODE_SLOTS, type NodeSlotId } from '@/constants/node-slots'
import { canConnect } from '@/lib/node-connection-rules'
import {
  NODE_EDGE_TIER_IDS,
  resolveNodeEdgeTierV4,
  resolveNodeEdgeVisibility,
} from '@/lib/node-edge-tier'
import {
  planSlotConnectRole,
  toConnectionEndpoint,
} from '@/lib/node-slot-binding'
import { isNodeWorkflowGenerating } from '@/lib/node-workflow-edge-visual'
import type { NodeGraphV4 } from '@/hooks/node/use-node-graph-v4'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'

import { NodeWorkflowStatusEdge } from '../edges/NodeWorkflowStatusEdge'
import { CanvasMiniMap } from '../CanvasMiniMap'
import { CanvasSurface } from '../CanvasSurface'
import { NODE_V4_COMPONENTS } from '../nodes/v4/registry'

const NODE_EDGE_COMPONENTS: EdgeTypes = {
  nodeWorkflowStatus: NodeWorkflowStatusEdge,
}

const NODE_STUDIO_DEFAULT_EDGE_OPTIONS: DefaultEdgeOptions = {
  type: 'nodeWorkflowStatus',
}

const CONNECTION_LINE_STYLE = {
  stroke: 'var(--node-edge-active)',
  strokeWidth: 2,
} as const

export interface CanvasV4Props {
  readonly graph: NodeGraphV4
  readonly toolMode: NodeStudioToolMode
  /** 关系线总开关（会话级）：`true` = 收起，只留骨干。 */
  readonly relationsCollapsed: boolean
  readonly canvasAppearance: Parameters<typeof CanvasSurface>[0]['appearance']
  onNodeClick?: NodeMouseHandler
  onPaneClick?(event: React.MouseEvent): void
  onPaneContextMenu?(event: React.MouseEvent | MouseEvent): void
  onDrop?(event: React.DragEvent): void
  onDragOver?(event: React.DragEvent): void
  readonly children?: React.ReactNode
}

export function CanvasV4({
  graph,
  toolMode,
  relationsCollapsed,
  canvasAppearance,
  onNodeClick,
  onPaneClick,
  onPaneContextMenu,
  onDrop,
  onDragOver,
  children,
}: CanvasV4Props) {
  const { rfNodes, edges, nodes, selectedNodeIds, neighborOffsets } = graph

  /**
   * 让位偏移在**渲染期**加到坐标上，⛔ 不写回 state：让位是「这一刻谁展开着」的
   * 视觉后果，落库会把它变成一次真实的移动（撤销栈里还会多出一条）。
   */
  const decoratedNodes = useMemo(() => {
    if (neighborOffsets.size === 0) return rfNodes as NodeWorkflowNode[]
    return rfNodes.map((node) => {
      const offset = neighborOffsets.get(node.id)
      if (!offset) return node
      return {
        ...node,
        position: {
          x: node.position.x + offset.x,
          y: node.position.y + offset.y,
        },
      }
    }) as NodeWorkflowNode[]
  }, [rfNodes, neighborOffsets])

  const renderEdges = useMemo(() => {
    const dataById = new Map(nodes.map((node) => [node.id, node.data] as const))
    return edges.map((edge) => {
      const base = {
        id: edge.id,
        source: edge.source,
        sourceHandle: edge.sourceHandle,
        target: edge.target,
        // 目标 handle 就是槽 id（见文件头注）。
        targetHandle: edge.slot,
      }
      const sourceData = dataById.get(edge.source)
      const targetData = dataById.get(edge.target)
      // 两端有一头不在图上 = 不画。
      if (!sourceData || !targetData) return { ...base, hidden: true }

      const tier = resolveNodeEdgeTierV4(sourceData, targetData)
      const endpointSelected =
        selectedNodeIds.includes(edge.source) ||
        selectedNodeIds.includes(edge.target)
      const visible = resolveNodeEdgeVisibility({
        tier,
        endpointSelected,
        targetGenerating: isNodeWorkflowGenerating(
          targetData.status,
          undefined,
        ),
        relationsCollapsed,
      })
      if (!visible) return { ...base, hidden: true }
      return {
        ...base,
        hidden: false,
        ...(tier === NODE_EDGE_TIER_IDS.ingredient && endpointSelected
          ? { data: { revealed: true } }
          : {}),
      }
    }) as unknown as NodeWorkflowEdge[]
  }, [edges, nodes, selectedNodeIds, relationsCollapsed])

  /**
   * 手型工具 = 左键随处平移；指针工具下只有中键/右键平移，左键留给框选
   * （Figma 的同一条分工）。⚠ RF 的 prop 要的是**可变数组**，常量表那份是
   * `readonly` —— 复制一份，⛔ 不把常量改成可变（它被别处只读引用）。
   */
  const panOnDrag = useMemo(
    () =>
      toolMode === NODE_STUDIO_TOOL_MODE_IDS.hand
        ? true
        : [...NODE_STUDIO_CANVAS.panOnDragButtons],
    [toolMode],
  )

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      graph.onRfNodesChange(changes)
    },
    [graph],
  )

  /**
   * 端口拖拽的合法性。⚠ 走的是 `canConnect` —— 与助手的 `planV4Connect`、与拖投
   * 的 `planV4IngestDrop` **同一张端口表**，⛔ 不在这里另判一遍。
   */
  const isValidConnection = useCallback<IsValidConnection>(
    (connection) => {
      const source = nodes.find((node) => node.id === connection.source)
      const target = nodes.find((node) => node.id === connection.target)
      if (!source || !target) return false
      const slot = connection.targetHandle
      if (!slot || !(NODE_SLOTS as readonly string[]).includes(slot)) {
        return false
      }
      const plan = planSlotConnectRole(
        source,
        target,
        slot as NodeSlotId,
        edges,
        nodes,
      )
      return canConnect(
        toConnectionEndpoint(source),
        toConnectionEndpoint(target),
        {
          slot: slot as NodeSlotId,
          occupancy: plan.occupancy,
          ...(plan.role ? { role: plan.role } : {}),
        },
      ).ok
    },
    [nodes, edges],
  )

  const onConnect = useCallback(
    (connection: {
      source: string
      target: string
      targetHandle?: string | null
    }) => {
      const slot = connection.targetHandle
      if (!slot || !(NODE_SLOTS as readonly string[]).includes(slot)) return
      graph.connect(connection.source, connection.target, slot as NodeSlotId)
    },
    [graph],
  )

  const onNodeDragStop = useCallback(
    (_event: unknown, _node: unknown, dragged: readonly NodeWorkflowNode[]) => {
      // 拖动**结束**才提交坐标（⛔ 不逐帧写 state：那会让一次拖拽产生几十次落库）。
      graph.moveNodes(
        dragged.map((node) => ({ id: node.id, position: node.position })),
      )
    },
    [graph],
  )

  const onNodesDelete = useCallback(
    (deleted: readonly { id: string }[]) => {
      graph.deleteNodes(deleted.map((node) => node.id))
    },
    [graph],
  )

  const onEdgesDelete = useCallback(
    (deleted: readonly { id: string }[]) => {
      for (const edge of deleted) graph.disconnect(edge.id)
    },
    [graph],
  )

  return (
    <>
      <CanvasSurface appearance={canvasAppearance} />
      <ReactFlow
        nodes={decoratedNodes}
        edges={renderEdges}
        nodeTypes={NODE_V4_COMPONENTS}
        edgeTypes={NODE_EDGE_COMPONENTS}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onPaneContextMenu={onPaneContextMenu}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onNodeDragStop={onNodeDragStop}
        onDrop={onDrop}
        onDragOver={onDragOver}
        deleteKeyCode={['Backspace', 'Delete']}
        defaultViewport={NODE_STUDIO_CANVAS.defaultViewport}
        minZoom={NODE_STUDIO_CANVAS.minZoom}
        maxZoom={NODE_STUDIO_CANVAS.maxZoom}
        defaultEdgeOptions={NODE_STUDIO_DEFAULT_EDGE_OPTIONS}
        connectionLineType={ConnectionLineType.SmoothStep}
        connectionLineStyle={CONNECTION_LINE_STYLE}
        proOptions={NODE_STUDIO_REACT_FLOW_PRO_OPTIONS}
        nodesDraggable
        nodesConnectable
        elementsSelectable
        // 边默认可聚焦会让 Tab 从画布进去先穿过所有线才轮到按钮（D1 键盘可达）。
        // 关掉只影响 Tab 序：鼠标点边选中 + Delete 删边照旧。
        edgesFocusable={false}
        selectNodesOnDrag={false}
        nodeDragThreshold={NODE_STUDIO_CANVAS.nodeDragThreshold}
        panOnDrag={panOnDrag}
        panActivationKeyCode={NODE_STUDIO_CANVAS.panActivationKeyCode}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        zoomOnScroll
        // 详情只从展开钮开；双击缩放在卡上要保持无效。
        zoomOnDoubleClick={false}
        fitView={false}
        className="h-full w-full !bg-transparent"
        style={{ backgroundColor: 'transparent' }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={NODE_STUDIO_CANVAS.background.gap}
          size={NODE_STUDIO_CANVAS.background.size}
          color="var(--canvas-grid-dot)"
        />
        {children}
      </ReactFlow>
      <CanvasMiniMap />
    </>
  )
}
