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
 * ── ⚠ C3c-③d-3：撤销栈 / 展开态 / 剪贴板搬进 `use-node-graph-v4` ────────
 * 本文件曾自带一份 `undoStack` / `redoStack` / `expandedNodeId` / `clipboardRef`。
 * ③d-3 把它们整体搬进图引擎并**只留一份**：工具栏、快捷键、卡内动作现在撤同一
 * 个栈。调用方可以传 `graph`（workbench 那一份实例）复用它；不传则本组件自己起
 * 一份（预览 / 单测路径）。⛔ 不要把栈搬回来 —— 两份栈会让「卡里点的」和
 * 「工具栏点的」各撤各的。
 */

import { useCallback, useEffect, useMemo, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import type { NodeSlotId } from '@/constants/node-slots'
import type { NodeWorkflowMediaKind } from '@/constants/node-types'
import {
  useNodeGraphV4,
  type NodeGraphV4,
} from '@/hooks/node/use-node-graph-v4'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type {
  NodeV4GenerationParams,
  NodeWorkflowModelOption,
  NodeWorkflowStateV4,
} from '@/types/node-workflow'

import {
  NodeV4CanvasProvider,
  type NodeTextDeriveAction,
  type NodeV4CanvasContextValue,
} from './NodeV4Context'

/**
 * op 失败理由 → 现有文案键。⛔ 只映射**这里真的会产出**的那几条；其余落
 * `opFailed` 的通用句（带原始理由），⚠ 不静默吞掉。
 */
const OP_FAILURE_KEYS: Readonly<Record<string, string>> = {
  unknownNode: 'connectRejected.unknownNode',
  unknownSlot: 'connectRejected.unknownSlot',
  unknownEdge: 'connectRejected.unknownNode',
  blockedVersion: 'connectRejected.blockedVersion',
}

export interface NodeV4ProviderProps {
  readonly state: NodeWorkflowStateV4
  /** 应用一条 op 之后的新 state。调用方负责持久化（预览路径下不写库）。 */
  onStateChange(next: NodeWorkflowStateV4): void
  /**
   * 调用方已经持有的那一份图引擎（`NodeWorkbenchV4` 传自己那份）。
   *
   * ⚠ 传了就**共用同一个撤销栈 / 展开态 / 剪贴板**，并且本组件的画布级快捷键
   * 让给调用方的那份（`WorkbenchShortcutsV4`）。不传 = 自己起一份（预览路径）。
   */
  readonly graph?: NodeGraphV4
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
  state,
  onStateChange,
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

  const onOpFailed = useCallback(
    (reason: string) => {
      const key = OP_FAILURE_KEYS[reason]
      toast.error(key ? t(key) : t('opFailed', { reason }))
    },
    [t],
  )

  /**
   * ⚠ hook 必须**无条件**调用（hooks 规则），所以没传 `graph` 时这一份就是实现，
   * 传了就把它晾着走调用方那一份。⛔ 不为了「省一次 useState」把它包进条件里。
   */
  const ownGraph = useNodeGraphV4({
    state,
    onStateChange,
    onOpFailed,
    ...(selectedNodeIds ? { selectedNodeIds } : {}),
  })
  const engine = graph ?? ownGraph

  const dispatch = engine.dispatch

  const onApplyOp = useCallback(
    (op: NodeAssistantOpV4) => {
      dispatch(op)
    },
    [dispatch],
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

  /**
   * 画布级快捷键（§3 跨节点）。
   *
   * ⚠ 打字时**一律不接管**：`⌘Z` 在 textarea 里是「撤销我刚敲的那几个字」，把它
   * 抢去撤销画布是 v3 时代最容易被抓到的一条。判据用 `closest`——`MentionInput` 是
   * contentEditable，事件靶子可能是内部的文本节点包装元素而不是输入框本身。
   *
   * ⛔ 不在这里绑删除键：删除已经由 ReactFlow 的 `deleteKeyCode` 接着，两处各绑
   * 一次会让一次按键删两遍（第二遍落在已经不存在的节点上，弹一条 `unknownNode`）。
   *
   * ⚠ ③d-3：复制 / 粘贴 / 撤销重做全部改调图引擎，⛔ 本组件不再自持剪贴板。
   * `NodeWorkbenchV4` 有自己的一份快捷键表（`WorkbenchShortcutsV4`）并接了
   * ⌘+Enter 生成；同时挂两份时按键会被两边各处理一次，所以 workbench 那条路径
   * 传 `graph` 进来并把这份关掉（`shortcuts={false}`）。
   */
  useEffect(() => {
    if (graph) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      // ⚠ `event.target` 不一定是元素 —— 没有焦点时它是 `document`／`window`，
      // 两者都没有 `closest`。
      const target = event.target
      if (
        target instanceof Element &&
        target.closest(
          'input, textarea, select, [contenteditable="true"], [role="textbox"]',
        )
      ) {
        return
      }
      const key = event.key.toLowerCase()
      if (key === 'c') {
        if (engine.copySelection()) event.preventDefault()
        return
      }
      if (key === 'v') {
        if (engine.pasteClipboard()) event.preventDefault()
        return
      }
      if (key === 'z') {
        event.preventDefault()
        if (event.shiftKey) engine.redo()
        else engine.undo()
        return
      }
      // ⌘+Enter = 生成。真实执行器在 `WorkbenchShortcutsV4`（它拿得到
      // `useNodeMediaGenerationV4`）；这条**没有 workbench 的**预览路径只诚实说明，
      // ⛔ 不静默吞掉：一个「按了没反应」的快捷键会被当成坏了，而不是「还没接」。
      if (event.key === 'Enter') {
        event.preventDefault()
        toast.info(t('generateDesk.shortcutPending'))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [graph, engine, t])

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
      onTidyLayout,
      onUndo,
      onRedo,
    ],
  )

  return <NodeV4CanvasProvider value={value}>{children}</NodeV4CanvasProvider>
}
