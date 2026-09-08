'use client'

/**
 * v4 **图引擎**（第三期 · 画布）。③d-4 起是画布**唯一**的图引擎 —— v3 那套
 * （`use-node-workflow` / `node-workflow-v3-view` / `StudioNodeWorkbench`）已删。
 *
 * ── 与两个既有层的分工 ────────────────────────────────────────────────
 * · `use-node-workflow-store.ts`（**复用**，不重写）：项目从哪来往哪去。
 * · 这里：那份 `NodeWorkflowStateV4` 上的**图语义** —— 建点 / 连线 / 删 / 复制 /
 *   排布 / 展开 / 撤销重做 / 剧本投影。
 * · `applyNodeAssistantOpV4`：唯一的**语义写入口**。
 *
 * ── 一条路径纪律（v3 引擎的老账正是死在这条上）───────────────────────
 * **每一个改图语义的动作都走 `applyNodeAssistantOpV4`**，与助手同一张 op 表、
 * 同一份 inverse、同一批 `changedNodeIds`。⛔ 不在这里直接 `setSlotVersion` /
 * `connectIntoSlot`：那会让「用户点的」和「助手做的」变成两条会漂的路径。
 *
 * 例外**只有三条**，每条都因为它根本不是「用户的一步意图」：
 *   ① `moveNodes`（拖动坐标）—— 进撤销栈等于把一次拖拽拆成几十条记录；
 *   ② `tidyLayout`（`tidyShotLanes`）—— 只动坐标不动语义（沿用 Provider 既有取舍）；
 *   ③ `setMedia`（上传/生成回填）—— 助手不许塞 URL（op 表 §5 纪律 1），
 *      它只可能来自用户自己的上传；
 *   ④ `setRunState`（生成跑起来的进度信号）—— 进 op 表等于给每一次进度跳变产生
 *      一条撤销记录，而它本身不是用户的意图（`NodeV4ActionsBridge` 例外 ① 的
 *      同一条论据）。⛔ 也不为它往 `set_field` 的封闭词表里加 `status`：那会让
 *      助手也能直接改运行态。
 * 四条都**不发 op、不进撤销栈**，且都在下面各自的注释里写明了理由。
 *
 * ── 撤销栈只有一份 ────────────────────────────────────────────────────
 * `NodeV4Provider` 从 ③d-3 起消费本 hook 的栈（见该文件头注），⛔ 两处各存一份
 * 的旧写法已删 —— 两份栈会让「卡里点的」和「工具栏点的」各撤各的。
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import { applyNodeChanges, type NodeChange } from '@xyflow/react'

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { NODE_V4_CARD } from '@/constants/node-studio'
import type { NodeSlotId } from '@/constants/node-slots'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import {
  applyInverseV4,
  applyNodeAssistantOpV4,
  type NodeV4Inverse,
} from '@/lib/node-assistant-op-apply-v4'
import { reconcileStateSlots } from '@/lib/node-slot-binding'
import { tidyShotLanes } from '@/lib/node-shot-layout'
import { projectScriptDocToGraphV4 } from '@/lib/node-workflow-script-doc-v4'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type { ScriptDoc } from '@/types/script-doc'
import type {
  NodeV4,
  NodeV4Data,
  NodeWorkflowEdgeV4,
  NodeWorkflowModelSelection,
  NodeWorkflowNode,
  NodeWorkflowStateV4,
} from '@/types/node-workflow'

import type { NodeV4MediaPatch } from '@/components/business/node/nodes/v4/NodeV4Context'

/** 一条撤销记录。`state` 档只给「重做之后再撤销」用，理由见 `redo`。 */
type NodeGraphV4HistoryEntry = {
  readonly undo:
    | { readonly kind: 'inverse'; readonly inverse: NodeV4Inverse }
    | { readonly kind: 'state'; readonly state: NodeWorkflowStateV4 }
  readonly redoState: NodeWorkflowStateV4
}

/** 剪贴板记的是**形状**，不是节点本身（⛔ 不复制媒体，见 `copySelection`）。 */
export interface NodeGraphV4ClipboardShape {
  readonly kind: NodeV4Data['kind']
  readonly subtype: NodeV4Data['subtype']
  readonly shotNo?: number
}

export interface NodeGraphV4Move {
  readonly id: string
  readonly position: { readonly x: number; readonly y: number }
}

/** 展开时邻居让开的位移（渲染期偏移，⛔ 不写进 state）。 */
export interface NodeGraphV4Offset {
  readonly x: number
  readonly y: number
}

/** 一次重投影的账。`kept` = 用户手工建的散节点（无 `shotNo`），原样留着。 */
export interface NodeGraphV4Projection {
  readonly created: readonly string[]
  readonly removed: readonly string[]
  readonly kept: readonly string[]
}

export interface NodeGraphV4AddOptions {
  readonly position?: { readonly x: number; readonly y: number }
  readonly shotNo?: number
  readonly name?: string
}

export interface UseNodeGraphV4Options {
  readonly state: NodeWorkflowStateV4
  /** 应用之后的新 state。持久化由调用方（store）负责。 */
  onStateChange(next: NodeWorkflowStateV4): void
  /**
   * `modelId` → 完整选择。⛔ 不给 = `setModel` 在没有旧选择可继承时**失败可见**，
   * 不静默半写（与 op 执行器同一条论据）。
   */
  resolveModel?(modelId: string): NodeWorkflowModelSelection | undefined
  /** op 失败的出声口（画布接 toast，测试接断言）。⛔ 不允许静默吞掉。 */
  onOpFailed?(reason: string): void
  /**
   * 外部持有的选中集（预览路径 / 由别的层驱动 RF 时）。
   *
   * ⚠ 给了就**盖过**本 hook 从 `rfNodes` 派生的那一份 —— 选中是视图状态，谁在
   * 驱动 ReactFlow 谁说了算。⛔ 不做「两份取并集」：那会让剪贴板复制到一张用户
   * 眼里没选中的卡。
   */
  selectedNodeIds?: readonly string[]
}

export interface NodeGraphV4 {
  readonly state: NodeWorkflowStateV4
  readonly nodes: readonly NodeV4[]
  readonly edges: readonly NodeWorkflowEdgeV4[]

  /* ── 渲染层（RF 受控）──────────────────────────────────────────────── */
  /**
   * ReactFlow 用的节点。⚠ **`measured` 必须活在这一层**：受控模式下尺寸是库
   * 通过 `onNodesChange` 的 `dimensions` 变更回传的，落不回节点对象就永远
   * `visibility: hidden` —— 卡在 DOM 里、量得到宽高、屏幕上一个都看不见
   * （C3c-① 实拍过这一幕）。所以 RF 节点是一份自己的 state：`data` / `position`
   * 跟着 v4 state 走，`measured` / `selected` 由 `applyNodeChanges` 维护。
   */
  readonly rfNodes: readonly NodeWorkflowNode[]
  onRfNodesChange(changes: NodeChange[]): void
  readonly selectedNodeIds: readonly string[]
  clearSelection(): void

  /* ── 展开 ──────────────────────────────────────────────────────────── */
  /** 同一时刻最多一个（§2.3）。 */
  readonly expandedNodeId: string | null
  setExpanded(nodeId: string | null): void
  toggleExpanded(nodeId: string): void
  /** 展开卡右侧邻居的让位偏移（渲染期加到 position 上）。 */
  readonly neighborOffsets: ReadonlyMap<string, NodeGraphV4Offset>

  /* ── 图动作 ────────────────────────────────────────────────────────── */
  dispatch(op: NodeAssistantOpV4): boolean
  addNode(
    kind: NodeV4Data['kind'],
    subtype: NodeV4Data['subtype'],
    options?: NodeGraphV4AddOptions,
  ): string | null
  connect(
    source: string,
    target: string,
    slot: NodeSlotId,
    options?: { readonly sourceHandle?: 'out' | 'tailFrame' },
  ): boolean
  disconnect(edgeId: string): boolean
  deleteNodes(nodeIds: readonly string[]): number
  /** 克隆**同类空节点**（保结构清内容），返回新 id。 */
  duplicate(nodeIds: readonly string[]): string[]
  /** 位置提交。⛔ 不进撤销栈（见文件头注例外 ①）。 */
  moveNodes(moves: readonly NodeGraphV4Move[]): void
  tidyLayout(): void
  setModel(nodeId: string, model: NodeWorkflowModelSelection): void
  /** 上传/生成回填（见文件头注例外 ③）。 */
  setMedia(nodeId: string, patch: NodeV4MediaPatch): void
  /** 生成/编辑的**运行态**（见文件头注例外 ④）。 */
  setRunState(nodeId: string, status: NodeV4Data['status']): void

  /* ── 剪贴板 ────────────────────────────────────────────────────────── */
  readonly clipboard: NodeGraphV4ClipboardShape | null
  copySelection(): boolean
  pasteClipboard(): string | null

  /* ── 撤销栈（**唯一**一份）─────────────────────────────────────────── */
  readonly canUndo: boolean
  readonly canRedo: boolean
  undo(): void
  redo(): void

  /* ── 剧本投影（单向）──────────────────────────────────────────────── */
  projectScriptDoc(doc: ScriptDoc, shotStills?: boolean): NodeGraphV4Projection
}

function mintId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.()
  return `${prefix}${random ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
}

/**
 * 收起态卡宽的估算 —— 让位的位移量。
 *
 * ⚠ 用常量表的两个宽度差，⛔ 不读 DOM：让位要在展开的**同一帧**发生，读 DOM 的
 * 版本会先叠一帧再弹开。镜头卡收起更宽（400），所以按各自的收起宽算。
 */
function collapsedWidthOf(data: NodeV4Data): number {
  if (data.kind === NODE_MEDIA_KIND_IDS.video && data.subtype === 'shot') {
    return NODE_V4_CARD.shotCollapsedWidth
  }
  if (data.kind === NODE_MEDIA_KIND_IDS.text) {
    return NODE_V4_CARD.textCollapsedWidth
  }
  return NODE_V4_CARD.collapsedWidth
}

/**
 * 邻居让位（`proto6-hig-notes.md` 未落三项之一）。
 *
 * 只推**右侧且纵向有重叠**的卡，推的量正好是「展开宽 − 这张卡的收起宽」。
 * ⚠ 纵向不做让位：展开是「原地长高」，下方的卡本来就在镜头带的下一行，推它们会
 * 把整条带的版式拆掉（版式的唯一权威是 `layoutShotLanes`）。
 */
function computeNeighborOffsets(
  nodes: readonly NodeV4[],
  expandedNodeId: string | null,
): ReadonlyMap<string, NodeGraphV4Offset> {
  const offsets = new Map<string, NodeGraphV4Offset>()
  if (!expandedNodeId) return offsets
  const expanded = nodes.find((node) => node.id === expandedNodeId)
  if (!expanded) return offsets

  const delta = NODE_V4_CARD.expandedWidth - collapsedWidthOf(expanded.data)
  if (delta <= 0) return offsets

  const top = expanded.position.y
  const bottom = top + NODE_V4_CARD.expandedMaxHeight

  for (const node of nodes) {
    if (node.id === expandedNodeId) continue
    if (node.position.x <= expanded.position.x) continue
    const nodeTop = node.position.y
    const nodeBottom = nodeTop + collapsedWidthOf(node.data)
    if (nodeBottom < top || nodeTop > bottom) continue
    offsets.set(node.id, { x: delta, y: 0 })
  }
  return offsets
}

export function useNodeGraphV4({
  state,
  onStateChange,
  resolveModel,
  onOpFailed,
  selectedNodeIds: selectedNodeIdsOverride,
}: UseNodeGraphV4Options): NodeGraphV4 {
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null)
  const [undoStack, setUndoStack] = useState<
    readonly NodeGraphV4HistoryEntry[]
  >([])
  const [redoStack, setRedoStack] = useState<
    readonly { readonly redoState: NodeWorkflowStateV4 }[]
  >([])
  const clipboardRef = useRef<NodeGraphV4ClipboardShape | null>(null)
  const [clipboard, setClipboard] = useState<NodeGraphV4ClipboardShape | null>(
    null,
  )

  /* ── RF 渲染层（`measured` 的家）──────────────────────────────────── */
  const [rendered, setRendered] = useState<{
    source: NodeWorkflowStateV4 | null
    nodes: NodeWorkflowNode[]
  }>({ source: null, nodes: [] })

  if (rendered.source !== state) {
    // 渲染期同步（React 官方的「派生 state」写法），⛔ 不放 effect 里：
    // effect 版会先画一帧空图再补上。
    const previous = new Map(rendered.nodes.map((node) => [node.id, node]))
    setRendered({
      source: state,
      nodes: state.nodes.map((node) => {
        const before = previous.get(node.id)
        return {
          ...before,
          id: node.id,
          // v4 里节点的 RF `type` 就是它的 `kind`（见 v4 注册表）。
          type: node.data.kind,
          // ⚠ 位置以 **state 为准**：`moveNodes` 在拖停时把坐标提交回 state，
          // 而 `tidyLayout` / 投影只改 state —— 渲染层留旧坐标会让「整理」看上去
          // 什么都没发生（v3 那版正是如此）。
          position: node.position,
          data: node.data,
          selected: before?.selected ?? false,
        } as unknown as NodeWorkflowNode
      }),
    })
  }

  const onRfNodesChange = useCallback((changes: NodeChange[]) => {
    setRendered((current) => ({
      ...current,
      nodes: applyNodeChanges(
        changes,
        current.nodes,
      ) as unknown as NodeWorkflowNode[],
    }))
  }, [])

  const derivedSelectedNodeIds = useMemo(
    () => rendered.nodes.filter((node) => node.selected).map((node) => node.id),
    [rendered.nodes],
  )
  const selectedNodeIds = selectedNodeIdsOverride ?? derivedSelectedNodeIds

  const clearSelection = useCallback(() => {
    setRendered((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.selected ? { ...node, selected: false } : node,
      ),
    }))
  }, [])

  /* ── 唯一写入口 ────────────────────────────────────────────────────── */
  /**
   * 上一条 op 铸出来的新节点 id。
   *
   * ⚠ 用 ref 而不是从 `state` 里差集算：`state` 是 prop，`dispatch` 之后的同一次
   * 渲染里它还是旧的那份，差集永远是空。执行器本来就把新 id 放在
   * `changedNodeIds` 里 —— 顺手记一笔比事后反查便宜也准。
   */
  const lastCreatedRef = useRef<string | null>(null)

  const dispatch = useCallback(
    (op: NodeAssistantOpV4): boolean => {
      const result = applyNodeAssistantOpV4(state, op, {
        mintId,
        ...(resolveModel ? { resolveModel } : {}),
      })
      if (!result.ok) {
        onOpFailed?.(result.reason)
        return false
      }
      lastCreatedRef.current =
        op.op === NODE_ASSISTANT_OP_V4_IDS.addNode
          ? (result.changedNodeIds[0] ?? null)
          : null
      // 整图 reconcile：槽绑定是**边的派生**，每次提交跑一遍才不会让某条路径
      // 上的 `slots` 与边分家（`reconcileStateSlots` 自己保引用相等）。
      const next = reconcileStateSlots(result.state)
      setUndoStack((stack) => [
        ...stack,
        { undo: { kind: 'inverse', inverse: result.inverse }, redoState: next },
      ])
      setRedoStack([])
      onStateChange(next)
      return true
    },
    [state, resolveModel, onOpFailed, onStateChange],
  )

  /**
   * 不进撤销栈的直改（文件头注的三条例外）。⛔ 只有那三条走这里，加第四条之前
   * 先问它是不是「用户的一步意图」—— 是的话它属于 op 表。
   */
  const commitWithoutHistory = useCallback(
    (next: NodeWorkflowStateV4) => {
      onStateChange(next)
    },
    [onStateChange],
  )

  const undo = useCallback(() => {
    const entry = undoStack[undoStack.length - 1]
    if (!entry) return
    setUndoStack((stack) => stack.slice(0, -1))
    setRedoStack((stack) => [...stack, { redoState: entry.redoState }])
    onStateChange(
      entry.undo.kind === 'inverse'
        ? reconcileStateSlots(
            applyInverseV4(state, entry.undo.inverse, { mintId }),
          )
        : entry.undo.state,
    )
  }, [undoStack, state, onStateChange])

  const redo = useCallback(() => {
    const entry = redoStack[redoStack.length - 1]
    if (!entry) return
    setRedoStack((stack) => stack.slice(0, -1))
    // ⚠ 重做推回撤销栈的那一条**不能**再用原来那份 inverse：它是对着「撤销前那
    // 份 state」算的。也不能用 `restore`（只把节点/边加回来，删不掉重做刚补上
    // 的）。所以这一档存整份快照。
    setUndoStack((stack) => [
      ...stack,
      { undo: { kind: 'state', state }, redoState: entry.redoState },
    ])
    onStateChange(entry.redoState)
  }, [redoStack, state, onStateChange])

  /* ── 图动作 ────────────────────────────────────────────────────────── */
  const addNode = useCallback(
    (
      kind: NodeV4Data['kind'],
      subtype: NodeV4Data['subtype'],
      options: NodeGraphV4AddOptions = {},
    ): string | null => {
      const ok = dispatch({
        op: NODE_ASSISTANT_OP_V4_IDS.addNode,
        kind,
        subtype,
        ...(options.position ? { position: options.position } : {}),
        ...(options.shotNo === undefined ? {} : { shotNo: options.shotNo }),
        ...(options.name ? { name: options.name } : {}),
      })
      return ok ? lastCreatedRef.current : null
    },
    [dispatch],
  )

  const connect = useCallback(
    (
      source: string,
      target: string,
      slot: NodeSlotId,
      options: { readonly sourceHandle?: 'out' | 'tailFrame' } = {},
    ): boolean =>
      dispatch({
        op: NODE_ASSISTANT_OP_V4_IDS.connect,
        source,
        target,
        slot,
        ...(options.sourceHandle ? { sourceHandle: options.sourceHandle } : {}),
      }),
    [dispatch],
  )

  const disconnect = useCallback(
    (edgeId: string): boolean =>
      dispatch({ op: NODE_ASSISTANT_OP_V4_IDS.disconnect, edgeId }),
    [dispatch],
  )

  const deleteNodes = useCallback(
    (nodeIds: readonly string[]): number => {
      let applied = 0
      let working = state
      const inverses: NodeV4Inverse[] = []
      for (const nodeId of nodeIds) {
        const result = applyNodeAssistantOpV4(
          working,
          { op: NODE_ASSISTANT_OP_V4_IDS.delete, target: nodeId },
          { mintId },
        )
        if (!result.ok) {
          onOpFailed?.(result.reason)
          continue
        }
        working = result.state
        inverses.push(result.inverse)
        applied += 1
      }
      if (applied === 0) return 0
      // 一次多选删除 = **一个**撤销条目（逆序回放）：框选删 8 张卡要按 8 次撤销
      // 才回得来，那不是用户按下那一次删除时的意图。
      const next = reconcileStateSlots(working)
      setUndoStack((stack) => [
        ...stack,
        {
          undo: {
            kind: 'inverse',
            inverse: { kind: 'sequence', items: [...inverses].reverse() },
          },
          redoState: next,
        },
      ])
      setRedoStack([])
      onStateChange(next)
      return applied
    },
    [state, onOpFailed, onStateChange],
  )

  const duplicate = useCallback(
    (nodeIds: readonly string[]): string[] => {
      const created: string[] = []
      let working = state
      const inverses: NodeV4Inverse[] = []
      for (const nodeId of nodeIds) {
        const node = state.nodes.find((candidate) => candidate.id === nodeId)
        if (!node) continue
        const result = applyNodeAssistantOpV4(
          working,
          {
            op: NODE_ASSISTANT_OP_V4_IDS.addNode,
            kind: node.data.kind,
            subtype: node.data.subtype,
            ...(node.data.shotNo === undefined
              ? {}
              : { shotNo: node.data.shotNo }),
          },
          { mintId },
        )
        if (!result.ok) {
          onOpFailed?.(result.reason)
          continue
        }
        working = result.state
        inverses.push(result.inverse)
        created.push(...result.changedNodeIds)
      }
      if (created.length === 0) return []
      const next = reconcileStateSlots(working)
      setUndoStack((stack) => [
        ...stack,
        {
          undo: {
            kind: 'inverse',
            inverse: { kind: 'sequence', items: [...inverses].reverse() },
          },
          redoState: next,
        },
      ])
      setRedoStack([])
      onStateChange(next)
      return created
    },
    [state, onOpFailed, onStateChange],
  )

  const moveNodes = useCallback(
    (moves: readonly NodeGraphV4Move[]) => {
      if (moves.length === 0) return
      const byId = new Map(moves.map((move) => [move.id, move.position]))
      let changed = false
      const nodes = state.nodes.map((node) => {
        const position = byId.get(node.id)
        if (!position) return node
        if (position.x === node.position.x && position.y === node.position.y) {
          return node
        }
        changed = true
        return { ...node, position: { x: position.x, y: position.y } }
      })
      if (!changed) return
      // ⛔ 不进撤销栈、不合并进上一条（文件头注例外 ①）。
      commitWithoutHistory({ ...state, nodes })
    },
    [state, commitWithoutHistory],
  )

  const tidyLayout = useCallback(() => {
    commitWithoutHistory(tidyShotLanes(state))
  }, [state, commitWithoutHistory])

  const setModel = useCallback(
    (nodeId: string, model: NodeWorkflowModelSelection) => {
      const result = applyNodeAssistantOpV4(
        state,
        {
          op: NODE_ASSISTANT_OP_V4_IDS.setModel,
          target: nodeId,
          modelId: model.modelId,
        },
        { mintId, resolveModel: () => model },
      )
      if (!result.ok) {
        onOpFailed?.(result.reason)
        return
      }
      // op 在有旧选择时只换 `modelId`（保留旧 adapter），而用户换的是**整条路由**
      // —— 把这份完整选择盖回去，否则换 provider 会留着上一家的 adapter。
      const next = reconcileStateSlots({
        ...result.state,
        nodes: result.state.nodes.map((node) =>
          node.id === nodeId && node.data.kind !== NODE_MEDIA_KIND_IDS.text
            ? { ...node, data: { ...node.data, model } }
            : node,
        ),
      })
      setUndoStack((stack) => [
        ...stack,
        { undo: { kind: 'inverse', inverse: result.inverse }, redoState: next },
      ])
      setRedoStack([])
      onStateChange(next)
    },
    [state, onOpFailed, onStateChange],
  )

  const setMedia = useCallback(
    (nodeId: string, patch: NodeV4MediaPatch) => {
      commitWithoutHistory({
        ...state,
        nodes: state.nodes.map((node) =>
          node.id === nodeId && node.data.kind !== NODE_MEDIA_KIND_IDS.text
            ? { ...node, data: { ...node.data, ...patch } }
            : node,
        ),
      })
    },
    [state, commitWithoutHistory],
  )

  const setRunState = useCallback(
    (nodeId: string, status: NodeV4Data['status']) => {
      commitWithoutHistory({
        ...state,
        nodes: state.nodes.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, status } }
            : node,
        ),
      })
    },
    [state, commitWithoutHistory],
  )

  /* ── 展开 ──────────────────────────────────────────────────────────── */
  const setExpanded = useCallback((nodeId: string | null) => {
    setExpandedNodeId(nodeId)
  }, [])

  const toggleExpanded = useCallback((nodeId: string) => {
    // 同一时刻最多一个（§2.3）：再点一次收起，点别的就换过去。
    setExpandedNodeId((current) => (current === nodeId ? null : nodeId))
  }, [])

  // 展开的那张卡被删/切项目之后 id 会悬空 —— 派生成 `null`，⛔ 不留一个指向
  // 不存在节点的展开态（那会让「同时只一个」的判据永远为真而卡片没在展开）。
  const liveExpandedNodeId =
    expandedNodeId && state.nodes.some((node) => node.id === expandedNodeId)
      ? expandedNodeId
      : null

  const neighborOffsets = useMemo(
    () => computeNeighborOffsets(state.nodes, liveExpandedNodeId),
    [state.nodes, liveExpandedNodeId],
  )

  /* ── 剪贴板 ────────────────────────────────────────────────────────── */
  const copySelection = useCallback((): boolean => {
    const only =
      selectedNodeIds.length === 1
        ? state.nodes.find((node) => node.id === selectedNodeIds[0])
        : undefined
    if (!only) return false
    // ⛔ 不复制媒体：一张图两个节点指向同一个 R2 对象，删任一个都会让另一个静默
    // 变空白。剪贴板只记「形状」，所以它跨项目也说得通。
    const shape: NodeGraphV4ClipboardShape = {
      kind: only.data.kind,
      subtype: only.data.subtype,
      ...(only.data.shotNo === undefined ? {} : { shotNo: only.data.shotNo }),
    }
    clipboardRef.current = shape
    setClipboard(shape)
    return true
  }, [selectedNodeIds, state.nodes])

  const pasteClipboard = useCallback((): string | null => {
    const shape = clipboardRef.current
    if (!shape) return null
    const ok = dispatch({
      op: NODE_ASSISTANT_OP_V4_IDS.addNode,
      kind: shape.kind,
      subtype: shape.subtype,
      ...(shape.shotNo === undefined ? {} : { shotNo: shape.shotNo }),
    })
    return ok ? lastCreatedRef.current : null
  }, [dispatch])

  /* ── 剧本投影（单向）──────────────────────────────────────────────── */
  const projectScriptDoc = useCallback(
    (doc: ScriptDoc, shotStills?: boolean): NodeGraphV4Projection => {
      const projected = projectScriptDocToGraphV4(doc, {
        makeId: (prefix) => mintId(prefix),
        ...(shotStills === undefined ? {} : { shotStills }),
      })

      /**
       * 重投影的孤儿判据（§8e-5「剧本文档改单向投影」）：
       *   · **有 `shotNo`** 的节点属于剧本管辖 → 整批换成新投影；
       *   · **没有 `shotNo`** 的散节点是用户手工建的 → 原样留着；
       *   · 留下来的边只有**两端都还在**的才留（槽合法性由下面那次 reconcile
       *     复核：端口表变了/槽满了的边会在 binding 里落空而不是悄悄生效）。
       * ⛔ 不按 `scriptRef` 反查 —— v4 节点上没有这个字段（C3b 已删）。
       */
      const kept = state.nodes.filter((node) => node.data.shotNo === undefined)
      const keptIds = new Set(kept.map((node) => node.id))
      const removed = state.nodes
        .filter((node) => node.data.shotNo !== undefined)
        .map((node) => node.id)
      const keptEdges = state.edges.filter(
        (edge) => keptIds.has(edge.source) && keptIds.has(edge.target),
      )

      const merged: NodeWorkflowStateV4 = {
        version: 4,
        nodes: [...kept, ...projected.nodes],
        edges: [...keptEdges, ...projected.edges],
      }
      const next = reconcileStateSlots(merged)
      // 投影是「把剧本这一版铺上去」，一次 = 一个撤销条目。
      setUndoStack((stack) => [
        ...stack,
        { undo: { kind: 'state', state }, redoState: next },
      ])
      setRedoStack([])
      onStateChange(next)
      return {
        created: projected.nodes.map((node) => node.id),
        removed,
        kept: kept.map((node) => node.id),
      }
    },
    [state, onStateChange],
  )

  return {
    state,
    nodes: state.nodes,
    edges: state.edges,
    rfNodes: rendered.nodes,
    onRfNodesChange,
    selectedNodeIds,
    clearSelection,
    expandedNodeId: liveExpandedNodeId,
    setExpanded,
    toggleExpanded,
    neighborOffsets,
    dispatch,
    addNode,
    connect,
    disconnect,
    deleteNodes,
    duplicate,
    moveNodes,
    tidyLayout,
    setModel,
    setMedia,
    setRunState,
    clipboard,
    copySelection,
    pasteClipboard,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    undo,
    redo,
    projectScriptDoc,
  }
}
