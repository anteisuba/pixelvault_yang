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

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'motion/react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  NODE_STUDIO_CANVAS,
  NODE_STUDIO_REACT_FLOW_PRO_OPTIONS,
  NODE_STUDIO_TOOL_MODE_IDS,
  type NodeStudioToolMode,
} from '@/constants/node-studio'
import { SPRING } from '@/constants/motion'
import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { NODE_PORT_HANDLE_IDS } from '@/constants/node-slots'
import { SHOT_TABLE_BOARD } from '@/constants/shot-spec'
import {
  edgePairKey,
  resolveNodeEdgeTierV4,
  resolveNodeEdgeVisibility,
} from '@/lib/node-edge-tier'
import { isNodeWorkflowGenerating } from '@/lib/node-workflow-edge-visual'
import {
  filmMaterialShots,
  isFilmMaterialNode,
  listIdleFilmMaterials,
  planFilmMaterialAdd,
} from '@/lib/shot-film-materials'
import { isPullSourceNode, isReferenceClip } from '@/lib/shot-pull-plan'
import {
  SHOT_MATERIAL_SLOTS,
  type ShotMaterialSlot,
} from '@/lib/shot-table-materials'
import {
  buildShotTableRows,
  compactShotlist,
  listShotTableNodes,
} from '@/lib/shot-table-rows'
import { planV4ConnectDrop } from '@/features/canvas/hooks/use-cast-ingest-v4'
import type { EdgeSigning } from '@/features/canvas/hooks/use-edge-signing'
import {
  useUpdateNodeInternalsOnInit,
  type ForceNodeInternalsUpdate,
} from '@/features/canvas/hooks/use-update-node-internals-on-init'
import type { NodeGraphV4 } from '@/features/canvas/hooks/use-node-graph-v4'
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
import { StoryboardBrackets } from './StoryboardBrackets'
import { layoutSlideOffset, useLayoutSlide } from './use-layout-slide'
import { CanvasSurface } from '../CanvasSurface'
import { NODE_V4_COMPONENTS } from '../nodes/v4/registry'
import { ShotTableNode } from '../shot-table/ShotTableNode'
import {
  SHOT_TABLE_CANVAS_IDLE,
  ShotTableCanvasProvider,
  type ShotTableCanvasState,
} from '../shot-table/shot-table-canvas-context'
import { useShotTableRfNode } from '../shot-table/use-shot-table-rf-node'

/**
 * 四类卡 + 镜头表卡（H1）。⚠ 表 ⛔ 不进 `NODE_V4_COMPONENTS`：那张表是 `state.nodes` 的
 * kind 词表，表不是一类卡（项目级一张，位置在 `state.shotlist.board`）。
 */
const CANVAS_NODE_TYPES = {
  ...NODE_V4_COMPONENTS,
  [SHOT_TABLE_BOARD.rfType]: ShotTableNode,
}

const SHOT_TABLE_ID = SHOT_TABLE_BOARD.nodeId

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
    // 镜头表卡不是落点（不收线、不收整卡拖放）；⛔ 让它挡住压在它上面的卡。
    if (id === SHOT_TABLE_ID) continue
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

/** 指针在不在镜头表卡上（H2b：拖素材卡进全片素材）。表垫在最底下，压在它上面的卡先被找到。 */
function pointOnShotTable(
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
  point: XYPosition,
): boolean {
  const table = nodeLookup.get(SHOT_TABLE_ID)
  if (!table) return false
  const { x, y } = table.internals.positionAbsolute
  return (
    point.x >= x &&
    point.x <= x + (table.measured.width ?? 0) &&
    point.y >= y &&
    point.y <= y + (table.measured.height ?? 0)
  )
}

const isShotMaterialSlot = (slot: string): slot is ShotMaterialSlot =>
  (SHOT_MATERIAL_SLOTS as readonly string[]).includes(slot)

/** 卡的入口在流坐标里的位置；handle 还没量出来时退到卡左边中点。 */
function inputPortFlowPoint(node: {
  readonly internals: {
    readonly positionAbsolute: XYPosition
    readonly handleBounds?: {
      readonly target?:
        | readonly {
            readonly id?: string | null
            readonly x: number
            readonly y: number
            readonly width: number
            readonly height: number
          }[]
        | null
    }
  }
  readonly measured: { height?: number | undefined }
}): XYPosition {
  const { x, y } = node.internals.positionAbsolute
  const targets = node.internals.handleBounds?.target ?? []
  const port =
    targets.find((handle) => handle.id === NODE_PORT_HANDLE_IDS.input) ??
    targets[0]
  if (port) {
    return { x: x + port.x + port.width / 2, y: y + port.y + port.height / 2 }
  }
  return { x, y: y + (node.measured.height ?? 0) / 2 }
}

/**
 * 拖动中的那条线（spec §1.13）：1.5px 虚线，进入**合法卡**变实线。
 *
 * ⚠ 判据不是 RF 的 `connectionStatus`（那只在指针压在 handle 上时才有值）——
 * 落点是整张卡，所以这里按指针位置自己找卡，再问画布算好的合法集合。
 *
 * 线头（动效样片 AB，owner 2026-10-08）：平时死跟指针；进了合法卡，线头用
 * `SPRING.slot` 吸到那张卡的入口；离开时同一根弹簧追回指针，追上了再改回死跟。
 * ⚠ 吸附只是**画法**：落点判定仍在 `onConnectEnd`（整卡都算），⛔ 不因为线头
 * 吸过去了就改判据。`prefers-reduced-motion` 下线头直接跳，不走弹簧。
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
  // 返回字符串而不是对象：选择器每次跑都新建对象会让 store 每帧都判「变了」。
  const snapKey = useStore(
    useCallback(
      (state) => {
        const hovered = nodeIdAtFlowPoint(state.nodeLookup, pointer)
        if (hovered === null || !connectState.legalTargetIds.has(hovered))
          return null
        const node = state.nodeLookup.get(hovered)
        if (!node) return null
        const port = inputPortFlowPoint(node)
        return `${port.x},${port.y}`
      },
      [pointer, connectState],
    ),
  )
  const overLegal = snapKey !== null
  const reduceMotion = useReducedMotion()
  const startX = useMotionValue(fromX)
  const startY = useMotionValue(fromY)
  const headX = useMotionValue(toX)
  const headY = useMotionValue(toY)
  /** 刚离开合法卡、线头还在追指针的路上。 */
  const returning = useRef(false)
  const snappedTo = useRef<string | null>(null)

  useLayoutEffect(() => {
    startX.set(fromX)
    startY.set(fromY)
    if (reduceMotion) {
      snappedTo.current = snapKey
      returning.current = false
      const [x, y] = snapKey ? snapKey.split(',').map(Number) : [toX, toY]
      headX.jump(x)
      headY.jump(y)
      return
    }
    if (snapKey) {
      if (snappedTo.current === snapKey) return
      snappedTo.current = snapKey
      returning.current = false
      const [x, y] = snapKey.split(',').map(Number)
      animate(headX, x, SPRING.slot)
      animate(headY, y, SPRING.slot)
      return
    }
    if (snappedTo.current !== null) {
      snappedTo.current = null
      returning.current = true
    }
    if (returning.current) {
      if (Math.abs(headX.get() - toX) < 1 && Math.abs(headY.get() - toY) < 1) {
        returning.current = false
      } else {
        // 指针每动一下就把弹簧的终点挪过去：动画接着当前速度走，读起来是一根弹簧在追。
        animate(headX, toX, SPRING.slot)
        animate(headY, toY, SPRING.slot)
        return
      }
    }
    headX.jump(toX)
    headY.jump(toY)
  }, [
    fromX,
    fromY,
    toX,
    toY,
    snapKey,
    reduceMotion,
    startX,
    startY,
    headX,
    headY,
  ])

  const d = useTransform(
    [startX, startY, headX, headY],
    ([ax, ay, bx, by]: number[]) =>
      `M${ax},${ay} C ${ax + 60},${ay} ${bx - 60},${by} ${bx},${by}`,
  )
  return (
    <motion.path
      fill="none"
      stroke="var(--node-foreground)"
      strokeWidth={1.5}
      strokeLinecap="round"
      {...(overLegal ? {} : { strokeDasharray: '6 6' })}
      d={d}
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
  /** 把一张有片子的片段卡拖到表上松手 = 拉这一段（H4a）。不给 = 照旧进全片素材。 */
  onPullClip?(clipNodeId: string): void
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
  onPullClip,
  children,
}: CanvasV4Props) {
  const { rfNodes, edges, nodes, selectedNodeIds, layoutSlide } = graph
  const slideLeft = useLayoutSlide(layoutSlide)
  const storeApi = useStoreApi()
  const tableBoard = graph.state.shotlist?.board
  const shotTable = useShotTableRfNode(tableBoard)

  /**
   * 表坐上画布时的全片素材（H2b，`canvas-shotlist.md` 第 26 条）：每张素材卡被哪几镜用（「N 镜」
   * 角标、到表左缘的线）+ 拖进来还闲着的（一根淡线到表顶）。表不在画布上 = 三样都不画。
   */
  const shotlist = graph.state.shotlist
  const filmOnCanvas = useMemo(() => {
    if (!tableBoard) return null
    const rows = buildShotTableRows({ nodes, edges, shotlist })
    const shots = filmMaterialShots(rows)
    const idle = listIdleFilmMaterials({ nodes, shotlist, used: shots }).map(
      (material) => material.sourceId,
    )
    return {
      shots,
      idle,
      rowIds: new Set(rows.map((row) => row.nodeId)),
      has: (id: string) => shots.has(id) || idle.includes(id),
    }
  }, [tableBoard, nodes, edges, shotlist])

  /**
   * 点着的素材：点一张素材卡 = 点着，再点一下 / 点空白 = 取消。只在它还是**唯一**选中的卡时
   * 算数（选了别的卡、框选一片 = 自然取消）。
   */
  const [focusPick, setFocusPick] = useState<string | null>(null)
  const focusId =
    filmOnCanvas &&
    focusPick &&
    selectedNodeIds.length === 1 &&
    selectedNodeIds[0] === focusPick &&
    filmOnCanvas.has(focusPick)
      ? focusPick
      : null
  /** 正压在表上、松手就进全片素材的那张卡（拖动中只在换状态时写一次）。 */
  const [tableDrop, setTableDrop] = useState<string | null>(null)
  const tableDropRef = useRef<string | null>(null)

  const slidNodes = useMemo(() => {
    if (slideLeft === 0) return rfNodes as NodeWorkflowNode[]
    return rfNodes.map((node) => {
      const slide = layoutSlideOffset(
        layoutSlide,
        slideLeft,
        node.id,
        node.position,
      )
      if (!slide) return node
      // 派生卡从来源边上滑出时同时淡入（§7 摆放 A 动效表）。
      const appearing = slide && layoutSlide?.appear?.has(node.id)
      return {
        ...node,
        position: {
          x: node.position.x + slide.x,
          y: node.position.y + slide.y,
        },
        ...(appearing
          ? { style: { ...node.style, opacity: 1 - slideLeft } }
          : {}),
      }
    }) as NodeWorkflowNode[]
  }, [rfNodes, layoutSlide, slideLeft])

  // 表卡垫在最底下（绘制顺序 = 数组顺序）：镜头卡挪到表上时压在表上面。
  const decoratedNodes = useMemo(
    () =>
      shotTable.node
        ? ([shotTable.node, ...slidNodes] as unknown as NodeWorkflowNode[])
        : slidNodes,
    [shotTable.node, slidNodes],
  )

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
        // 表坐上画布后，素材 → 镜头卡的直连线退成淡线；点着这张素材时变淡蓝（第 26 条 ①）。
        ...(filmOnCanvas &&
        filmOnCanvas.rowIds.has(edge.target) &&
        isShotMaterialSlot(edge.slot) &&
        filmOnCanvas.shots.has(edge.source)
          ? focusId === edge.source
            ? { focusSoft: true }
            : { faded: true }
          : {}),
      }
      return { ...base, hidden: false, data }
    })

    // 表的每行右缘 → 这一镜的镜头卡（H1）。纯画法：⛔ 不进 `state.edges`，不能选、不能删。
    const rowEdges = tableBoard
      ? listShotTableNodes(nodes).map((shot) => ({
          id: `${SHOT_TABLE_BOARD.rowEdgePrefix}${shot.id}`,
          source: SHOT_TABLE_ID,
          sourceHandle: `${SHOT_TABLE_BOARD.rowHandlePrefix}${shot.id}`,
          target: shot.id,
          targetHandle: NODE_PORT_HANDLE_IDS.input,
          hidden: false,
          selectable: false,
          deletable: false,
          focusable: false,
          // 点着一张素材时，没用到它的那几行的线压暗。
          data:
            focusId && !filmOnCanvas?.shots.get(focusId)?.includes(shot.id)
              ? { dimmed: true }
              : {},
        }))
      : []

    /**
     * 素材卡右缘 → 表左缘（H2b）：平时一根，落在第一行用到它的那一行；点着它时散到每一行、
     * 变蓝。闲着的（进了全片素材、还没人用）一根淡线到表顶。角色库的人不是画布卡，不画线。
     * 纯画法：⛔ 不进 `state.edges`，不能选、不能删；收起关系线时只留点着的那张。
     */
    const materialEdges = []
    if (filmOnCanvas) {
      const materialEdge = (cardId: string, handle: string, idle: boolean) => {
        const focused = focusId === cardId
        return {
          id: `${SHOT_TABLE_BOARD.materialEdgePrefix}${cardId}:${handle}`,
          source: cardId,
          sourceHandle: NODE_PORT_HANDLE_IDS.output,
          target: SHOT_TABLE_ID,
          targetHandle: handle,
          hidden: relationsCollapsed && !focused,
          selectable: false,
          deletable: false,
          focusable: false,
          data: focused
            ? { focus: true }
            : {
                ...(idle ? { faded: true } : {}),
                ...(focusId ? { dimmed: true } : {}),
              },
        }
      }
      for (const [cardId, shotIds] of filmOnCanvas.shots) {
        const targets = focusId === cardId ? shotIds : shotIds.slice(0, 1)
        for (const shotId of targets) {
          materialEdges.push(
            materialEdge(
              cardId,
              `${SHOT_TABLE_BOARD.materialHandlePrefix}${shotId}`,
              false,
            ),
          )
        }
      }
      for (const cardId of filmOnCanvas.idle) {
        materialEdges.push(
          materialEdge(cardId, SHOT_TABLE_BOARD.materialTopHandle, true),
        )
      }
    }

    /**
     * 参考片 → 表顶（H4a mock ①）：标成「参考」还没拉 = 虚线，表里有行拉自它 = 实线。已经作为
     * 全片素材连着表的不再画第二根。纯画法，同上。
     */
    const referenceEdges = []
    if (tableBoard) {
      const pulledFrom = new Set(
        listShotTableNodes(nodes)
          .map((shot) => shot.data.shot?.ref?.nodeId)
          .filter((id): id is string => Boolean(id)),
      )
      for (const clip of nodes) {
        if (!isReferenceClip(clip) || filmOnCanvas?.has(clip.id)) continue
        referenceEdges.push({
          id: `${SHOT_TABLE_BOARD.materialEdgePrefix}ref:${clip.id}`,
          source: clip.id,
          sourceHandle: NODE_PORT_HANDLE_IDS.output,
          target: SHOT_TABLE_ID,
          targetHandle: SHOT_TABLE_BOARD.materialTopHandle,
          hidden: relationsCollapsed,
          selectable: false,
          deletable: false,
          focusable: false,
          data: pulledFrom.has(clip.id) ? {} : { dashed: true },
        })
      }
    }
    const synthetic = [...rowEdges, ...materialEdges, ...referenceEdges]
    const drawn = synthetic.length > 0 ? [...live, ...synthetic] : live

    if (fadingEdges.size === 0) return drawn as unknown as NodeWorkflowEdge[]

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
      ? [...drawn, ...echoes]
      : drawn) as unknown as NodeWorkflowEdge[]
  }, [
    edges,
    nodes,
    selectedNodeIds,
    relationsCollapsed,
    signedEdgePairs,
    fadingEdges,
    tableBoard,
    filmOnCanvas,
    focusId,
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

  /** 按 id 分两路：表卡的进本地（`useShotTableRfNode`），其余照旧进图引擎。 */
  const applyShotTableChanges = shotTable.applyChanges
  const endShotTableDrag = shotTable.endDrag
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const forTable: NodeChange[] = []
      const forGraph: NodeChange[] = []
      for (const change of changes) {
        const id = 'id' in change ? change.id : undefined
        if (id === SHOT_TABLE_ID) forTable.push(change)
        else forGraph.push(change)
      }
      if (forTable.length > 0) applyShotTableChanges(forTable)
      if (forGraph.length > 0) graph.onRfNodesChange(forGraph)
    },
    [graph, applyShotTableChanges],
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
      // 表卡不是 `state.nodes` 里的卡：外壳的点卡逻辑（选中 / 详情）认不得它。
      if (node.id === SHOT_TABLE_ID) return
      // 点一张全片素材卡 = 点着它（线散开变蓝）；再点一下 = 取消（第 26 条）。
      if (filmOnCanvas?.has(node.id)) {
        setFocusPick(focusId === node.id ? null : node.id)
      }
      onNodeClick?.(event, node)
    },
    [
      quickThrowSource,
      feedQuickThrow,
      graph,
      onNodeClick,
      filmOnCanvas,
      focusId,
    ],
  )

  const handlePaneClick = useCallback(
    (event: React.MouseEvent) => {
      // 点空白 = 退出快投（Esc 那条在引擎里）；也取消点着的素材。
      if (quickThrowSource) exitQuickThrow()
      setFocusPick(null)
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
      // 拖表卡只是挪位置：⛔ 不找落点、不交给名册。
      if (node.id === SHOT_TABLE_ID) return
      const point = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })
      const nodeLookup = storeApi.getState().nodeLookup
      const hovered = nodeIdAtFlowPoint(nodeLookup, point)
      const over = hovered === node.id ? null : hovered
      // 一张素材卡压在表上（没压在别的卡上）= 松手就进全片素材（H2b mock ③）。
      const card =
        tableBoard && over === null
          ? nodes.find((item) => item.id === node.id)
          : undefined
      const nextDrop =
        card && isFilmMaterialNode(card) && pointOnShotTable(nodeLookup, point)
          ? node.id
          : null
      if (nextDrop !== tableDropRef.current) {
        tableDropRef.current = nextDrop
        setTableDrop(nextDrop)
      }
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
    [
      screenToFlowPosition,
      storeApi,
      legalTargetsOf,
      onNodeDrag,
      tableBoard,
      nodes,
    ],
  )

  const onNodeDragStop = useCallback(
    (
      event: React.MouseEvent,
      node: NodeWorkflowNode,
      dragged: readonly NodeWorkflowNode[],
    ) => {
      const hovered = dragHoverRef.current
      const droppedOnTable = tableDropRef.current === node.id
      tableDropRef.current = null
      setTableDrop(null)
      endConnect()
      // 表卡（单拖或框选里带着）：坐标落进 `shotlist.board`（拖动坐标例外，不进撤销栈）。
      const tableMoved = dragged.find((moved) => moved.id === SHOT_TABLE_ID)
      if (tableMoved) {
        graph.moveShotTable(tableMoved.position)
        endShotTableDrag()
      }
      const cards = dragged.filter((moved) => moved.id !== SHOT_TABLE_ID)
      if (node.id === SHOT_TABLE_ID) {
        if (cards.length > 0) {
          graph.moveNodes(
            cards.map((moved) => ({ id: moved.id, position: moved.position })),
          )
        }
        return
      }
      // 名册卡先接：吃掉了就连坐标都不提交（本体已被弹回起点）。
      if (onNodeDragStopIntercept?.(node, event)) return
      const snapBack = () => {
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
      }
      // 有片子的片段卡松在表上 = 拉片（H4a mock ②）：打开拉片纸，卡留在原位。
      if (
        droppedOnTable &&
        onPullClip &&
        isPullSourceNode(nodes.find((item) => item.id === node.id))
      ) {
        onPullClip(node.id)
        snapBack()
        return
      }
      // 松在表上 = 进全片素材（一步撤销），卡**留在原位**（第 26 条 / mock ③）。
      if (droppedOnTable) {
        for (const op of planFilmMaterialAdd(graph.readState(), node.id)) {
          graph.dispatch(op)
        }
        snapBack()
        return
      }
      // 松在另一张卡上 = 连上，卡**弹回原位**（它不该留在目标卡上）。
      if (hovered && hovered !== node.id) {
        connectDrop(node.id, hovered)
        snapBack()
        return
      }
      // 拖动**结束**才提交坐标（⛔ 不逐帧写 state：那会让一次拖拽产生几十次落库）。
      graph.moveNodes(
        cards.map((moved) => ({ id: moved.id, position: moved.position })),
      )
    },
    [
      graph,
      nodes,
      onNodeDragStopIntercept,
      onPullClip,
      connectDrop,
      endConnect,
      endShotTableDrag,
    ],
  )

  /**
   * 删表 = 把 `board` 从 `shotlist` 里拿掉（一步撤销；镜头卡一张不动）。框选连表带卡一起删时
   * 是两步：先删卡、再收表，撤两下全回来。
   */
  const onNodesDelete = useCallback(
    (deleted: readonly { id: string }[]) => {
      const cardIds = deleted
        .map((node) => node.id)
        .filter((id) => id !== SHOT_TABLE_ID)
      if (cardIds.length > 0) graph.deleteNodes(cardIds)
      if (!deleted.some((node) => node.id === SHOT_TABLE_ID)) return
      const shotlist = graph.readState().shotlist
      if (!shotlist?.board) return
      graph.dispatch({
        op: NODE_ASSISTANT_OP_V4_IDS.setShotlist,
        shotlist: compactShotlist({ ...shotlist, board: undefined }),
      })
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

  // ⚠ 组件身份要稳：内联箭头每次重渲都是一个新组件类型，RF 会把线整条重挂，
  //   线头那两根弹簧的位置与速度跟着丢。只随拖线起止（`connectState`）换。
  const connectionLineComponent = useCallback(
    (props: ConnectionLineComponentProps) => (
      <CanvasConnectionLineV4 {...props} connectState={connectState} />
    ),
    [connectState],
  )

  /** 卡壳 / 表卡读的那一份（H2b）：「N 镜」、点着的素材、压在表上的卡。 */
  const shotTableCanvas = useMemo<ShotTableCanvasState>(() => {
    if (!filmOnCanvas) return SHOT_TABLE_CANVAS_IDLE
    const dimIds = new Set<string>()
    if (focusId) {
      for (const id of [...filmOnCanvas.shots.keys(), ...filmOnCanvas.idle]) {
        if (id !== focusId) dimIds.add(id)
      }
    }
    return {
      shotCounts: new Map(
        [...filmOnCanvas.shots].map(([id, shotIds]) => [id, shotIds.length]),
      ),
      focusId,
      dimIds,
      dropSourceId: tableDrop,
      dropPull:
        tableDrop !== null &&
        onPullClip !== undefined &&
        isPullSourceNode(nodes.find((item) => item.id === tableDrop)),
    }
  }, [filmOnCanvas, focusId, tableDrop, nodes, onPullClip])

  return (
    <NodeConnectStateProvider value={connectState}>
      <ShotTableCanvasProvider value={shotTableCanvas}>
        <CanvasSurface appearance={canvasAppearance} />
        <ReactFlow
          nodes={decoratedNodes}
          edges={renderEdges}
          nodeTypes={CANVAS_NODE_TYPES}
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
              ? (event, node) => {
                  if (node.id !== SHOT_TABLE_ID) onNodeDragStart(node, event)
                }
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
          connectionLineComponent={connectionLineComponent}
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
          // 滚轮 / 双指滑动平移；捏合与 ⌘/Ctrl + 滚轮缩放（见 NODE_STUDIO_CANVAS）。
          panOnScroll
          panOnScrollSpeed={NODE_STUDIO_CANVAS.panOnScrollSpeed}
          zoomOnScroll
          zoomOnPinch
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
          <StoryboardBrackets nodes={nodes} />
          {children}
        </ReactFlow>
        {/* 小地图常显、可收成右下一颗 —— 收放是它自己的状态（`CanvasMiniMap` 的
          `expanded`），⛔ 外壳不再存第二份。 */}
        <CanvasMiniMap hidden={graph.expandedNodeId !== null} />
      </ShotTableCanvasProvider>
    </NodeConnectStateProvider>
  )
}
