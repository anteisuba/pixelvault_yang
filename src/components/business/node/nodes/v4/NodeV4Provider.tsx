'use client'

/**
 * v4 画布上下文的**实现方**（第三期 · 画布 C3c-① B）。
 *
 * `NodeV4Context` 从 C3a 起就只有签名没有实现 —— 于是槽卡上的「设为当前」/「×」、
 * 卡头的展开切换、文本卡的编辑与五个派生动作全都点得下去、什么都不发生。这个
 * 组件把它们接到真正的 state 更新上。
 *
 * ── 一条路径纪律（⚠ 别开第二条）────────────────────────────────────────
 * **每一个改 state 的回调都走 `applyNodeAssistantOpV4`**，与助手用的是同一张 op
 * 表、同一份 inverse、同一批 `changedNodeIds`。⛔ 不在这里直接调
 * `setSlotVersion` / `disconnectEdge` —— 那会让「用户点的」和「助手做的」变成两条
 * 语义会漂移的路径（v3 时代 `updateNodeData` 与 op 应用各写一份，正是撤销粒度
 * 长期对不齐的来源）。
 *
 * ⚠ 失败**必须出声**：op 返回 `ok:false` 时弹 toast 说明理由。静默失败和「按钮
 * 坏了」在用户眼里一模一样，而 `blockedVersion`（停用版不能设为当前）恰恰是一条
 * 需要被读到的规则。
 *
 * ── 展开态存在哪 ────────────────────────────────────────────────────────
 * 存在图引擎里（`use-node-graph-v4`），**不落库**：v4 的 `NodeV4BaseShape` 里没有
 * `collapsed` / `expanded` 字段——§1.3 明确把那两个零消费者的桩随 v4 删掉了。而且
 * 展开是「我现在正在看哪一个」，同一时刻只有一个（§2.3），跨设备同步它没有意义，
 * 落库反而会给每次展开产生一条撤销记录。
 *
 * ── ⚠ 撤销栈 / 展开态 / 剪贴板都在图引擎里 ──────────────────────────────
 * 本文件曾自带一份 `undoStack` / `redoStack` / `expandedNodeId` / `clipboardRef`，
 * ③d-3 整体搬进 `use-node-graph-v4` 并**只留一份**：工具栏、快捷键、卡内动作撤
 * 同一个栈。③d-4 起 `graph` 是必给的 prop —— 本组件不再自己起引擎，也不再自带
 * 画布级快捷键（唯一一份在 `WorkbenchShortcutsV4`）。⛔ 不要把栈搬回来。
 */

import { useCallback, useMemo, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import type { NodeSlotId } from '@/constants/node-slots'
import type { NodeWorkflowMediaKind } from '@/constants/node-types'
import type { NodeGraphV4 } from '@/hooks/node/use-node-graph-v4'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type {
  NodeV4GenerationParams,
  NodeWorkflowModelOption,
} from '@/types/node-workflow'

import {
  NodeV4CanvasProvider,
  type NodeTextDeriveAction,
  type NodeV4CanvasContextValue,
} from './NodeV4Context'

export interface NodeV4ProviderProps {
  /**
   * 调用方持有的那一份图引擎（`NodeWorkbenchV4` 传自己那份）。
   *
   * ⚠ **必给**：③d-4 之后本组件只是图引擎的**投影**，不再自己起一份。曾经的
   * 「不传就自己起一份」是预览路径的遗物，而两份引擎 = 两个撤销栈 = 卡里点的和
   * 工具栏点的各撤各的。
   */
  readonly graph: NodeGraphV4
  readonly draggingFrom?: string | null
  readonly changedNodeIds?: readonly string[]
  /** ReactFlow 的选中集。多选时各卡收起自己的工具条。 */
  readonly selectedNodeIds?: readonly string[]
  /** 生成编排区的模型清单，按 kind 分档（`useWorkflowModelOptions` 的产物）。 */
  readonly modelOptionsByKind?: Partial<
    Record<NodeWorkflowMediaKind, NodeWorkflowModelOption[]>
  >
  /** 点槽内缩略 = 高亮并平移到源节点（相机是画布的事，不在这一层做）。 */
  onFocusNode?(nodeId: string): void
  /** 文本卡工具条的五个派生动作。 */
  onDeriveFromText?(nodeId: string, action: NodeTextDeriveAction): void
  readonly children: ReactNode
}

export function NodeV4Provider({
  graph,
  draggingFrom = null,
  changedNodeIds,
  selectedNodeIds,
  modelOptionsByKind,
  onFocusNode,
  onDeriveFromText,
  children,
}: NodeV4ProviderProps) {
  const t = useTranslations('StudioNode.v4')

  const engine = graph

  const dispatch = engine.dispatch

  const onApplyOp = useCallback(
    (op: NodeAssistantOpV4) => {
      dispatch(op)
    },
    [dispatch],
  )

  // ⚠ 直接把引擎那颗 `dispatchBatch` 递出去：别名表（`add_node.ref`）与「一批 =
  // 一个撤销条目」都长在它身上，⛔ 不在这一层循环调 `dispatch` 重造一个。
  const dispatchBatch = engine.dispatchBatch
  const onApplyBatch = useCallback(
    (ops: readonly NodeAssistantOpV4[]) => {
      // 回执只透出 `createdNodeIds`（S6 抽帧要给刚建的图片卡回填 url）——
      // ⛔ 不把整份 `NodeGraphV4BatchResult` 摊到渲染层，那会让计数字段变成契约。
      const result = dispatchBatch(ops)
      return { createdNodeIds: result.createdNodeIds }
    },
    [dispatchBatch],
  )

  const onToggleExpanded = engine.toggleExpanded

  const onSelectSlotVersion = useCallback(
    (nodeId: string, slot: NodeSlotId, versionId: string) => {
      dispatch({
        op: NODE_ASSISTANT_OP_V4_IDS.setSlotVersion,
        target: nodeId,
        slot,
        versionId,
      })
    },
    [dispatch],
  )

  const onDisconnectSlot = useCallback(
    (nodeId: string, slot: NodeSlotId, versionId: string) => {
      // 槽卡认的是 versionId，op 认的是 edgeId —— 版本条目自己带着 `edgeId`
      // （每个版本就是一条真边），所以这里是一次读取而不是一次反查。
      const edgeId = engine.nodes
        .find((node) => node.id === nodeId)
        ?.data.slots?.[
          slot
        ]?.versions.find((version) => version.id === versionId)?.edgeId
      if (!edgeId) {
        toast.error(t('connectRejected.unknownSlot'))
        return
      }
      dispatch({ op: NODE_ASSISTANT_OP_V4_IDS.disconnect, edgeId })
    },
    [dispatch, engine.nodes, t],
  )

  const onEditText = useCallback(
    (nodeId: string, body: string) => {
      dispatch({
        op: NODE_ASSISTANT_OP_V4_IDS.setText,
        target: nodeId,
        body,
        mode: 'replace',
      })
    },
    [dispatch],
  )

  const onSetPrompt = useCallback(
    (nodeId: string, prompt: string) => {
      dispatch({
        op: NODE_ASSISTANT_OP_V4_IDS.setPrompt,
        target: nodeId,
        prompt,
        mode: 'replace',
      })
    },
    [dispatch],
  )

  const onSetParams = useCallback(
    (nodeId: string, params: NodeV4GenerationParams) => {
      dispatch({
        op: NODE_ASSISTANT_OP_V4_IDS.setParams,
        target: nodeId,
        params,
      })
    },
    [dispatch],
  )

  const onSetModel = engine.setModel
  const onSetMedia = engine.setMedia
  const onTidyLayout = engine.tidyLayout
  const onUndo = engine.undo
  const onRedo = engine.redo

  const value = useMemo<NodeV4CanvasContextValue>(
    () => ({
      nodes: engine.nodes,
      edges: engine.edges,
      draggingFrom,
      changedNodeIds: changedNodeIds ?? [],
      selectedNodeIds: selectedNodeIds ?? engine.selectedNodeIds,
      expandedNodeId: engine.expandedNodeId,
      modelOptionsByKind: modelOptionsByKind ?? {},
      onToggleExpanded,
      onSelectSlotVersion,
      onDisconnectSlot,
      onFocusNode: onFocusNode ?? (() => {}),
      onEditText,
      onDeriveFromText: onDeriveFromText ?? (() => {}),
      onSetPrompt,
      onSetModel,
      onSetParams,
      onSetMedia,
      onApplyOp,
      onApplyBatch,
      onTidyLayout,
      canUndo: engine.canUndo,
      canRedo: engine.canRedo,
      onUndo,
      onRedo,
    }),
    [
      engine.nodes,
      engine.edges,
      engine.selectedNodeIds,
      engine.expandedNodeId,
      engine.canUndo,
      engine.canRedo,
      draggingFrom,
      changedNodeIds,
      selectedNodeIds,
      modelOptionsByKind,
      onToggleExpanded,
      onSelectSlotVersion,
      onDisconnectSlot,
      onFocusNode,
      onEditText,
      onDeriveFromText,
      onSetPrompt,
      onSetModel,
      onSetParams,
      onSetMedia,
      onApplyOp,
      onApplyBatch,
      onTidyLayout,
      onUndo,
      onRedo,
    ],
  )

  return <NodeV4CanvasProvider value={value}>{children}</NodeV4CanvasProvider>
}
