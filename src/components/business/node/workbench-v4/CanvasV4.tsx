'use client'

/**
 * v4 原生的 ReactFlow 画布（第三期 · 画布）。③d-4 起是画布的**唯一**实现。
 *
 * ── 与 ③d-4 之前那块 v3 引擎画布的差别 ────────────────────────────────
 * 那边的节点是 v4、但**图仍是 v3 引擎**在管（`workflow.onNodesChange` /
 * `workflow.onConnect` 读写 v3 视图）。这里整条换成 v4：节点来自
 * `useNodeGraphV4().rfNodes`，边由 v4 的 `kind`/`subtype`/`status` 分档
 * （`resolveNodeEdgeTierV4`）并走同一张可见性矩阵（`resolveNodeEdgeVisibility`）。
 *
 * ⚠ S6e 起卡上**只有一入一出**（spec §1.13）：所有边的 `targetHandle` / `sourceHandle`
 * 一律写成 `NODE_PORT_HANDLE_IDS` 的那两个，槽仍然活在 `edge.slot` 上。存量里
 * `sourceHandle = 'tailFrame'` 的接续边因此照样画得出来（数据不动，只是不再有第二
 * 个口）。
 *
 * ⚠ 连线**不走 `onConnect`**：§1.13 要求「线松在卡上任何位置都算连上」，而 RF 的
 * `onConnect` 只在松在 handle 上（或 `connectionRadius` 内）时才发。所以落点判定收在
 * `onConnectEnd`：按指针位置找卡 → `planV4ConnectDrop` 定槽 → 连或拒。⛔ 不能两处
 * 都接（会连出两条边）。
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  ReactFlow,
  SelectionMode,
  useReactFlow,
  useStore,
  useStoreApi,
  type ConnectionLineComponentProps,
  type DefaultEdgeOptions,
  type EdgeTypes,
  type FinalConnectionState,
  type OnConnectStart,
  type NodeChange,
  type NodeMouseHandler,
  type XYPosition,
} from '@xyflow/react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  NODE_STUDIO_CANVAS,
  NODE_STUDIO_REACT_FLOW_PRO_OPTIONS,
  NODE_STUDIO_TOOL_MODE_IDS,
  type NodeStudioToolMode,
} from '@/constants/node-studio'
import { NODE_PORT_HANDLE_IDS } from '@/constants/node-slots'
import {
  edgePairKey,
  resolveNodeEdgeTierV4,
  resolveNodeEdgeVisibility,
} from '@/lib/node-edge-tier'
import { isNodeWorkflowGenerating } from '@/lib/node-workflow-edge-visual'
import { planV4ConnectDrop } from '@/hooks/node/use-cast-ingest-v4'
import type { EdgeSigning } from '@/hooks/node/use-edge-signing'
import {
  useUpdateNodeInternalsOnInit,
  type ForceNodeInternalsUpdate,
} from '@/hooks/node/use-update-node-internals-on-init'
import type { NodeGraphV4 } from '@/hooks/node/use-node-graph-v4'
import type {
  NodeWorkflowEdge,
  NodeWorkflowEdgeV4,
  NodeWorkflowNode,
} from '@/types/node-workflow'

import { useIngestDragV4 } from '../IngestDragLayerV4'
import { NodeSlotEdge, isRoleChangeableEdge } from '../edges/NodeSlotEdge'
import {
  NODE_CONNECT_STATE_IDLE,
  NodeConnectStateProvider,
  type NodeConnectState,
} from '../nodes/v4/chrome/node-connect-state'
import { flashNodeCardReject } from '../nodes/v4/chrome/node-card-flash'
import { CanvasMiniMap } from '../CanvasMiniMap'
import { CanvasSurface } from '../CanvasSurface'
import { NODE_V4_COMPONENTS } from '../nodes/v4/registry'

const NODE_EDGE_COMPONENTS: EdgeTypes = {
  nodeSlot: NodeSlotEdge,
}

const NODE_STUDIO_DEFAULT_EDGE_OPTIONS: DefaultEdgeOptions = {
  type: 'nodeSlot',
}

/**
 * 一条 v4 边 → 渲染层的两个 handle（S6e）。
 *
 * ⚠ 存量里 `video.shot` 的接续边带 `sourceHandle = 'tailFrame'`，而那个口 S6e 起
 * **不画了**（续拍走工具条）。所以渲染层一律写统一出口 —— 不这么写的话，那些边
 * 会因为找不到 handle 而整条消失（数据还在，用户眼里是「线没了」）。
 */
export function toRenderEdgeBase(edge: NodeWorkflowEdgeV4) {
  return {
    id: edge.id,
    source: edge.source,
    sourceHandle: NODE_PORT_HANDLE_IDS.output,
    target: edge.target,
    targetHandle: NODE_PORT_HANDLE_IDS.input,
  }
}

/**
 * 指针底下是哪张卡（流坐标）。⚠ 倒着找 —— `nodeLookup` 的顺序就是绘制顺序，
 * 后面的压在上面。
 */
function nodeIdAtFlowPoint(
  nodeLookup: ReadonlyMap<
    string,
    {
      readonly internals: { readonly positionAbsolute: XYPosition }
      readonly measured: {
        width?: number | undefined
        height?: number | undefined
      }
    }
  >,
  point: XYPosition | null,
): string | null {
  if (!point) return null
  let hit: string | null = null
  for (const [id, node] of nodeLookup) {
    const { x, y } = node.internals.positionAbsolute
    const width = node.measured.width ?? 0
    const height = node.measured.height ?? 0
    if (
      point.x >= x &&
      point.x <= x + width &&
      point.y >= y &&
      point.y <= y + height
    ) {
      hit = id
    }
  }
  return hit
}

/**
 * 拖动中的那条线（spec §1.13）：1.5px 虚线，进入**合法卡**变实线。
 *
 * ⚠ 判据不是 RF 的 `connectionStatus`（那只在指针压在 handle 上时才有值）——
 * 落点是整张卡，所以这里按指针位置自己找卡，再问画布算好的合法集合。
 */
function CanvasConnectionLineV4({
  fromX,
  fromY,
  toX,
  toY,
  pointer,
  connectState,
}: ConnectionLineComponentProps & {
  readonly connectState: NodeConnectState
}) {
  const overLegal = useStore(
    useCallback(
      (state) => {
        const hovered = nodeIdAtFlowPoint(state.nodeLookup, pointer)
        return hovered !== null && connectState.legalTargetIds.has(hovered)
      },
      [pointer, connectState],
    ),
  )
  return (
    <path
      fill="none"
      stroke="var(--node-foreground)"
      strokeWidth={1.5}
      strokeLinecap="round"
      {...(overLegal ? {} : { strokeDasharray: '6 6' })}
      d={`M${fromX},${fromY} C ${fromX + 60},${fromY} ${toX - 60},${toY} ${toX},${toY}`}
    />
  )
}

export interface CanvasV4Props {
  readonly graph: NodeGraphV4
  readonly toolMode: NodeStudioToolMode
  /** 关系线总开关（会话级）：`true` = 收起，只留骨干。 */
  readonly relationsCollapsed: boolean
  readonly canvasAppearance: Parameters<typeof CanvasSurface>[0]['appearance']
  /**
   * §2.7 墨线签署 / 解绑反放的记账（`useEdgeSigning`）。装饰层在这里读，⛔ 不在
   * 画布内部自己记 —— 写入方（连边 / 断边）在 workbench 层。
   */
  readonly edgeSigning: EdgeSigning
  onNodeClick?: NodeMouseHandler
  /** 名册落位（8-b）借 RF 自己的节点拖拽生命周期，⛔ 不另起一台指针引擎。 */
  onNodeDragStart?(node: NodeWorkflowNode, event: React.MouseEvent): void
  onNodeDrag?(node: NodeWorkflowNode, event: React.MouseEvent): void
  /** 返回 `true` = 这一拖已被名册卡吃掉，画布不再提交坐标。 */
  onNodeDragStopIntercept?(
    node: NodeWorkflowNode,
    event: React.MouseEvent,
  ): boolean
  onPaneClick?(event: React.MouseEvent): void
  onPaneContextMenu?(event: React.MouseEvent | MouseEvent): void
  /**
   * 双击空白（S7：就地弹四颗小图标）。
   *
   * ⚠ ReactFlow 没有 `onPaneDoubleClick`，所以挂在宿主上并**自己判靶子**是不是
   * pane —— ⛔ 不能只看 `event.target === currentTarget`：双击落在背景点阵上时
   * 靶子是 `.react-flow__pane` 的子元素。
   */
  onPaneDoubleClick?(event: React.MouseEvent): void
  onDrop?(event: React.DragEvent): void
  onDragOver?(event: React.DragEvent): void
  readonly children?: React.ReactNode
}

export function CanvasV4({
  graph,
  toolMode,
  relationsCollapsed,
  canvasAppearance,
  edgeSigning,
  onNodeClick,
  onNodeDragStart,
  onNodeDrag,
  onNodeDragStopIntercept,
  onPaneClick,
  onPaneContextMenu,
  onPaneDoubleClick,
  onDrop,
  onDragOver,
  children,
}: CanvasV4Props) {
  const { rfNodes, edges, nodes, selectedNodeIds, neighborOffsets } = graph
  const storeApi = useStoreApi()

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

  const { signedEdgePairs, fadingEdges } = edgeSigning
  const renderEdges = useMemo(() => {
    const dataById = new Map(nodes.map((node) => [node.id, node.data] as const))
    const live = edges.map((edge) => {
      const base = toRenderEdgeBase(edge)
      const sourceData = dataById.get(edge.source)
      const targetData = dataById.get(edge.target)
      // 两端有一头不在图上 = 不画。
      if (!sourceData || !targetData) return { ...base, hidden: true }

      const tier = resolveNodeEdgeTierV4(sourceData, targetData)
      const endpointSelected =
        selectedNodeIds.includes(edge.source) ||
        selectedNodeIds.includes(edge.target)
      const underlyingShouldRender = resolveNodeEdgeVisibility({
        tier,
        endpointSelected,
        targetGenerating: isNodeWorkflowGenerating(
          targetData.status,
          undefined,
        ),
        relationsCollapsed,
      })
      // §2.7：正在签署的边整段强制显形，与 §2.2 的答案无关。
      const signingPhase = signedEdgePairs.get(
        edgePairKey(edge.source, edge.target),
      )
      const isSigning = signingPhase !== undefined
      if (!underlyingShouldRender && !isSigning) {
        return { ...base, hidden: true }
      }

      const data = {
        slot: edge.slot,
        ...(endpointSelected ? { endpointSelected: true } : {}),
        ...(isNodeWorkflowGenerating(targetData.status, undefined)
          ? { running: true }
          : {}),
        // 图片源的边可以在胶囊里改角色（作首帧 / 作尾帧 / 作参考）。
        ...(isRoleChangeableEdge(sourceData.kind, edge.slot)
          ? { roleChangeable: true }
          : {}),
        ...(signingPhase === 'drawing' ? { justSigned: true } : {}),
        ...(signingPhase === 'fading' && !underlyingShouldRender
          ? { signingFadeOut: true }
          : {}),
      }
      return { ...base, hidden: false, data }
    })

    if (fadingEdges.size === 0) return live as unknown as NodeWorkflowEdge[]

    // §2.7 解绑反放：刚删掉、还在反向褪去的边补一份装饰性回声。按 id 去重，免得
    // 一条其实还在图上的边被画两遍。
    const liveIds = new Set(live.map((edge) => edge.id))
    const echoes = []
    for (const edge of fadingEdges.values()) {
      if (liveIds.has(edge.id)) continue
      if (!dataById.has(edge.source) || !dataById.has(edge.target)) continue
      echoes.push({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        hidden: false,
        data: { unsigning: true },
      })
    }
    return (echoes.length > 0
      ? [...live, ...echoes]
      : live) as unknown as NodeWorkflowEdge[]
  }, [
    edges,
    nodes,
    selectedNodeIds,
    relationsCollapsed,
    signedEdgePairs,
    fadingEdges,
  ])

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
   * 快投模式（S5f B2）。⚠ 处理在**画布里**而不是 workbench 里：模式活在
   * `IngestDragProviderV4` 的 context 上，而 workbench 在那个 provider 外面
   * （v3 那边为此拿一个 ref 把 API 发布出去 —— 这里不需要那道桥）。
   */
  const { quickThrowSource, feedQuickThrow, exitQuickThrow } = useIngestDragV4()

  const handleNodeClick = useCallback<NodeMouseHandler>(
    (event, node) => {
      if (quickThrowSource) {
        feedQuickThrow(node.id)
        /**
         * ⚠ ReactFlow 自己的 pointerdown 在本回调之前就把这张卡选中了，于是一次
         * 快投点击会顺带留下一个「选中」——那又会显现它的成分边（§2.2），而
         * 快投有自己那套高亮、不与选中显现叠加。所以把这次顺带的选中撤掉。
         */
        graph.onRfNodesChange([
          { id: node.id, type: 'select', selected: false },
        ])
        return
      }
      onNodeClick?.(event, node)
    },
    [quickThrowSource, feedQuickThrow, graph, onNodeClick],
  )

  const handlePaneClick = useCallback(
    (event: React.MouseEvent) => {
      // 点空白 = 退出快投（Esc 那条在引擎里）。
      if (quickThrowSource) exitQuickThrow()
      onPaneClick?.(event)
    },
    [quickThrowSource, exitQuickThrow, onPaneClick],
  )

  const handleDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      if (!onPaneDoubleClick) return
      const target = event.target
      if (!(target instanceof Element)) return
      if (!target.closest('.react-flow__pane')) return
      onPaneDoubleClick(event)
    },
    [onPaneDoubleClick],
  )

  /* ── 连线（spec §1.13）─────────────────────────────────────────────── */

  const tReasons = useTranslations('StudioNode.v4.connectRejected')
  const { screenToFlowPosition } = useReactFlow()
  const [connectState, setConnectState] = useState<NodeConnectState>(
    NODE_CONNECT_STATE_IDLE,
  )
  /** 整卡拖放时上一帧压住的那张卡 —— 只在换卡时才重算一次合法性。 */
  const dragHoverRef = useRef<string | null>(null)

  /**
   * 合法目标集合**算一次**（拖线起手 / 整卡压上另一张卡时），⛔ 不逐帧算：
   * 一次拖线否则就是「卡数 × 帧数」次矩阵查询。
   */
  const legalTargetsOf = useCallback(
    (sourceId: string): Set<string> => {
      const source = nodes.find((node) => node.id === sourceId)
      const legal = new Set<string>()
      if (!source) return legal
      for (const target of nodes) {
        if (target.id === sourceId) continue
        if (
          planV4ConnectDrop(source, target, edges, nodes).kind === 'connect'
        ) {
          legal.add(target.id)
        }
      }
      return legal
    },
    [nodes, edges],
  )

  const beginConnect = useCallback(
    (sourceId: string) => {
      setConnectState({
        active: true,
        sourceId,
        legalTargetIds: legalTargetsOf(sourceId),
      })
    },
    [legalTargetsOf],
  )

  const endConnect = useCallback(() => {
    dragHoverRef.current = null
    setConnectState(NODE_CONNECT_STATE_IDLE)
  }, [])

  /**
   * 落一条边：槽由**来源 kind** 推（`planV4ConnectDrop`，与 `@` 引用 / 拖投同一张
   * 默认表）。拒绝要**看得见**：目标卡短暂红环 + 一行理由，⛔ 不静默失败。
   */
  const connectDrop = useCallback(
    (sourceId: string, targetId: string): boolean => {
      const source = nodes.find((node) => node.id === sourceId)
      const target = nodes.find((node) => node.id === targetId)
      if (!source || !target || source.id === target.id) return false
      const plan = planV4ConnectDrop(source, target, edges, nodes)
      if (plan.kind === 'rejected') {
        flashNodeCardReject(target.id)
        toast.error(tReasons(plan.reason))
        return false
      }
      return graph.connect(source.id, target.id, plan.slot)
    },
    [nodes, edges, graph, tReasons],
  )

  const onConnectStart = useCallback<OnConnectStart>(
    (_event, params) => {
      if (params.nodeId) beginConnect(params.nodeId)
    },
    [beginConnect],
  )

  /**
   * 落点判定（见文件头注：⛔ 不用 `onConnect`）。指针底下有卡就连，没有就只收尾。
   */
  const onConnectEnd = useCallback(
    (_event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      const sourceId = state.fromNode?.id ?? null
      const targetId =
        state.toNode?.id ??
        nodeIdAtFlowPoint(storeApi.getState().nodeLookup, state.to)
      if (sourceId && targetId) connectDrop(sourceId, targetId)
      endConnect()
    },
    [connectDrop, endConnect, storeApi],
  )

  /**
   * 整卡拖到另一张卡上（spec §1.13 末句）。压上去时目标进入与拖线同一套发光态，
   * ⛔ 平移卡片时不点亮任何东西（只有真的压在另一张卡上才算「在找落点」）。
   */
  const handleNodeDrag = useCallback(
    (event: React.MouseEvent, node: NodeWorkflowNode) => {
      const point = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })
      const hovered = nodeIdAtFlowPoint(storeApi.getState().nodeLookup, point)
      const over = hovered === node.id ? null : hovered
      if (over !== dragHoverRef.current) {
        dragHoverRef.current = over
        setConnectState(
          over === null
            ? NODE_CONNECT_STATE_IDLE
            : {
                active: true,
                sourceId: node.id,
                legalTargetIds: legalTargetsOf(node.id),
              },
        )
      }
      onNodeDrag?.(node, event)
    },
    [screenToFlowPosition, storeApi, legalTargetsOf, onNodeDrag],
  )

  const onNodeDragStop = useCallback(
    (
      event: React.MouseEvent,
      node: NodeWorkflowNode,
      dragged: readonly NodeWorkflowNode[],
    ) => {
      const hovered = dragHoverRef.current
      endConnect()
      // 名册卡先接：吃掉了就连坐标都不提交（本体已被弹回起点）。
      if (onNodeDragStopIntercept?.(node, event)) return
      // 松在另一张卡上 = 连上，卡**弹回原位**（它不该留在目标卡上）。
      if (hovered && hovered !== node.id) {
        connectDrop(node.id, hovered)
        const origin = nodes.find((item) => item.id === node.id)?.position
        if (origin) {
          graph.onRfNodesChange([
            {
              id: node.id,
              type: 'position',
              position: origin,
              dragging: false,
            },
          ])
        }
        return
      }
      // 拖动**结束**才提交坐标（⛔ 不逐帧写 state：那会让一次拖拽产生几十次落库）。
      graph.moveNodes(
        dragged.map((moved) => ({ id: moved.id, position: moved.position })),
      )
    },
    [graph, nodes, onNodeDragStopIntercept, connectDrop, endConnect],
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

  /**
   * 首绘时把 handle 位置强推一遍 —— 判据是**真实目标**（应可见的边数 vs DOM 里
   * 实际存在的 `g.react-flow__edge`），⛔ 不看 `nodesInitialized`/`handleBounds`
   * （会死锁），⛔ 也不数 DOM 节点（节点齐了边还是 0）。一次性，普通重渲（比如
   * 拖节点）不会再触发。
   */
  const getExpectedVisibleEdgeCount = useCallback(
    () => storeApi.getState().edges.filter((edge) => !edge.hidden).length,
    [storeApi],
  )
  const applyForcedNodeInternals = useCallback(
    (updates: Map<string, ForceNodeInternalsUpdate>) => {
      storeApi.getState().updateNodeInternals(updates)
    },
    [storeApi],
  )
  useUpdateNodeInternalsOnInit(
    nodes,
    getExpectedVisibleEdgeCount,
    applyForcedNodeInternals,
  )

  return (
    <NodeConnectStateProvider value={connectState}>
      <CanvasSurface appearance={canvasAppearance} />
      <ReactFlow
        nodes={decoratedNodes}
        edges={renderEdges}
        nodeTypes={NODE_V4_COMPONENTS}
        edgeTypes={NODE_EDGE_COMPONENTS}
        onNodesChange={onNodesChange}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        onPaneContextMenu={onPaneContextMenu}
        onDoubleClick={handleDoubleClick}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onNodeDragStart={
          onNodeDragStart
            ? (event, node) => onNodeDragStart(node, event)
            : undefined
        }
        onNodeDrag={handleNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onDrop={onDrop}
        onDragOver={onDragOver}
        deleteKeyCode={['Backspace', 'Delete']}
        defaultViewport={NODE_STUDIO_CANVAS.defaultViewport}
        minZoom={NODE_STUDIO_CANVAS.minZoom}
        maxZoom={NODE_STUDIO_CANVAS.maxZoom}
        defaultEdgeOptions={NODE_STUDIO_DEFAULT_EDGE_OPTIONS}
        connectionLineType={ConnectionLineType.Bezier}
        connectionLineComponent={(props) => (
          <CanvasConnectionLineV4 {...props} connectState={connectState} />
        )}
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
      {/* 小地图常显、可收成右下一颗 —— 收放是它自己的状态（`CanvasMiniMap` 的
          `expanded`），⛔ 外壳不再存第二份。 */}
      <CanvasMiniMap />
    </NodeConnectStateProvider>
  )
}
