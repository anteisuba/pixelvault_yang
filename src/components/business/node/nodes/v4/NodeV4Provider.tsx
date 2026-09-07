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
 * 存在这里（组件 state），**不落库**：v4 的 `NodeV4BaseShape` 里没有 `collapsed`
 * / `expanded` 字段——§1.3 明确把那两个零消费者的桩随 v4 删掉了。而且展开是
 * 「我现在正在看哪一个」，同一时刻只有一个（§2.3），跨设备同步它没有意义，落库
 * 反而会给每次展开产生一条撤销记录。
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import type { NodeSlotId } from '@/constants/node-slots'
import type { NodeWorkflowMediaKind } from '@/constants/node-types'
import {
  applyInverseV4,
  applyNodeAssistantOpV4,
  type NodeV4Inverse,
} from '@/lib/node-assistant-op-apply-v4'
import { tidyShotLanes } from '@/lib/node-shot-layout'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type {
  NodeV4Data,
  NodeV4GenerationParams,
  NodeWorkflowModelOption,
  NodeWorkflowModelSelection,
  NodeWorkflowStateV4,
} from '@/types/node-workflow'

import {
  NodeV4CanvasProvider,
  type NodeTextDeriveAction,
  type NodeV4CanvasContextValue,
  type NodeV4MediaPatch,
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

/**
 * 一个撤销条目。
 *
 * `inverse` 档是常态（正向 op 落地时执行器顺手算出来的那份）；`state` 档只给
 * 「重做之后再撤销」用，理由写在 `onRedo` 里。
 */
type NodeV4HistoryEntry = {
  readonly undo:
    | { readonly kind: 'inverse'; readonly inverse: NodeV4Inverse }
    | { readonly kind: 'state'; readonly state: NodeWorkflowStateV4 }
  readonly redoState: NodeWorkflowStateV4
}

export interface NodeV4ProviderProps {
  readonly state: NodeWorkflowStateV4
  /** 应用一条 op 之后的新 state。调用方负责持久化（预览路径下不写库）。 */
  onStateChange(next: NodeWorkflowStateV4): void
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
  draggingFrom = null,
  changedNodeIds,
  selectedNodeIds,
  modelOptionsByKind,
  onFocusNode,
  onDeriveFromText,
  children,
}: NodeV4ProviderProps) {
  const t = useTranslations('StudioNode.v4')
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null)

  /**
   * 撤销栈（§7 「撤销重做走 op inverses」）。
   *
   * ⚠ 一条成功的 op = **一个**撤销条目。存 `inverse`（而不是「改前的整份 state」）
   * 是 §7 定的：助手一轮可能是十几条 op，逐条存整份 state 会把内存和 diff 成本
   * 都翻十几倍，而 inverse 本来就是执行器顺手算出来的。
   *
   * ── 为什么「重做」存的是**结果 state**，不是「把原 op 再跑一遍」───────
   * `add_node` 每跑一次 `mintId` 都发一个新 id。重跑 = 新节点 id ≠ 被撤销的那个，
   * 于是所有指向它的边、`@` 提及、下游槽绑定全部指空。⛔ 不为了对称把 id 也一起
   * 重做——重做的语义是「把刚才那一步原样放回来」，那就得是同一个节点。
   *
   * 栈只活在这个 Provider 里（预览态本来就不落库）；新 op 落地时清空重做栈——
   * 撤销后又改了别的，那条被撤销的分支就不该还能回来。
   */
  const [undoStack, setUndoStack] = useState<readonly NodeV4HistoryEntry[]>([])
  const [redoStack, setRedoStack] = useState<
    readonly { redoState: NodeWorkflowStateV4 }[]
  >([])

  const mintId = useCallback(
    (prefix: string) => `${prefix}${crypto.randomUUID()}`,
    [],
  )

  const dispatch = useCallback(
    (op: NodeAssistantOpV4): boolean => {
      const result = applyNodeAssistantOpV4(state, op, { mintId })
      if (!result.ok) {
        const key = OP_FAILURE_KEYS[result.reason]
        toast.error(key ? t(key) : t('opFailed', { reason: result.reason }))
        return false
      }
      setUndoStack((stack) => [
        ...stack,
        {
          undo: { kind: 'inverse', inverse: result.inverse },
          redoState: result.state,
        },
      ])
      setRedoStack([])
      onStateChange(result.state)
      return true
    },
    [state, mintId, onStateChange, t],
  )

  const onUndo = useCallback(() => {
    const entry = undoStack[undoStack.length - 1]
    if (!entry) return
    setUndoStack((stack) => stack.slice(0, -1))
    setRedoStack((stack) => [...stack, { redoState: entry.redoState }])
    onStateChange(
      entry.undo.kind === 'inverse'
        ? applyInverseV4(state, entry.undo.inverse, { mintId })
        : entry.undo.state,
    )
  }, [undoStack, state, mintId, onStateChange])

  const onRedo = useCallback(() => {
    const entry = redoStack[redoStack.length - 1]
    if (!entry) return
    setRedoStack((stack) => stack.slice(0, -1))
    // ⚠ 重做推回撤销栈的那一条**不能**再用原来那份 inverse：那份 inverse 是针对
    // 「撤销前那份 state」算的，现在的 state 已经是撤销后的了。也不能用 `restore`
    // —— 它只把节点/边**加回来**，删不掉重做刚补上的那些。所以这一档存整份快照。
    // ⛔ 不为了对称把正向 op 也改成存快照：正向那一条走 inverse 才是 §7 定的。
    const snapshot = state
    setUndoStack((stack) => [
      ...stack,
      {
        undo: { kind: 'state', state: snapshot },
        redoState: entry.redoState,
      },
    ])
    onStateChange(entry.redoState)
  }, [redoStack, state, onStateChange])

  /**
   * 「复制」记下的**形状**（kind / subtype / shotNo），不是节点本身。
   * ⚠ 用 ref 而不是 state：剪贴板变了不需要重渲染任何一张卡。
   */
  const clipboardRef = useRef<{
    kind: NodeV4Data['kind']
    subtype: NodeV4Data['subtype']
    shotNo?: number
  } | null>(null)

  /**
   * 画布级快捷键（§3 跨节点）。
   *
   * ⚠ 打字时**一律不接管**：`⌘Z` 在 textarea 里是「撤销我刚敲的那几个字」，把它
   * 抢去撤销画布是 v3 时代最容易被抓到的一条。判据用 `closest`——`MentionInput` 是
   * contentEditable，事件靶子可能是内部的文本节点包装元素而不是输入框本身。
   *
   * ⛔ 不在这里绑删除键：删除已经由 ReactFlow 的 `deleteKeyCode` 接着，两处各绑
   * 一次会让一次按键删两遍（第二遍落在已经不存在的节点上，弹一条 `unknownNode`）。
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      // ⚠ `event.target` 不一定是元素 —— 没有焦点时它是 `document`／`window`，
      // 两者都没有 `closest`。⛔ 不直接 `target.closest(...)`：那会在「画布上什么都
      // 没选中的时候按 ⌘Z」这条最常见的路径上抛异常，而异常吞掉之后表现就是
      // 「撤销键坏了」。
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
      // 复制 / 粘贴 = **同类空节点**，与工具条的「克隆」是同一条语义（owner 定）。
      // ⛔ 不复制媒体：一张图两个节点指向同一个 R2 对象，删任一个都会让另一个
      // 静默变空白。剪贴板只记「形状」，所以它跨项目也说得通。
      if (key === 'c') {
        const only =
          selectedNodeIds?.length === 1
            ? state.nodes.find((node) => node.id === selectedNodeIds[0])
            : undefined
        if (!only) return
        event.preventDefault()
        clipboardRef.current = {
          kind: only.data.kind,
          subtype: only.data.subtype,
          ...(only.data.shotNo === undefined
            ? {}
            : { shotNo: only.data.shotNo }),
        }
        return
      }
      if (key === 'v') {
        const shape = clipboardRef.current
        if (!shape) return
        event.preventDefault()
        dispatch({ op: NODE_ASSISTANT_OP_V4_IDS.addNode, ...shape })
        return
      }
      if (key === 'z') {
        event.preventDefault()
        if (event.shiftKey) onRedo()
        else onUndo()
        return
      }
      // ⌘+Enter = 生成。执行器在 C3d（`generate` 那条 op 要走真实的生成链路），
      // 这一步只把键位占住并诚实说明——⛔ 不静默吞掉：一个「按了没反应」的快捷键
      // 会被当成坏了，而不是「还没做」。
      if (event.key === 'Enter') {
        event.preventDefault()
        toast.info(t('generateDesk.shortcutPending'))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onUndo, onRedo, dispatch, selectedNodeIds, state.nodes, t])

  // 通用出口：展开态里那些「一次性」的 op（delete / clone / connect /
  // move_to_shot …）不再各自加一个具名回调，全部从这里出去 —— 与具名回调**同一条**
  // 路径（同一张 op 表、同一份 inverse、同一批失败文案）。
  const onApplyOp = useCallback(
    (op: NodeAssistantOpV4) => {
      dispatch(op)
    },
    [dispatch],
  )

  const onToggleExpanded = useCallback((nodeId: string) => {
    // 同一时刻最多一个展开（§2.3）：再点一次收起，点别的就换过去。
    setExpandedNodeId((current) => (current === nodeId ? null : nodeId))
  }, [])

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
      const edgeId = state.nodes
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
    [dispatch, state.nodes, t],
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

  const onSetModel = useCallback(
    (nodeId: string, model: NodeWorkflowModelSelection) => {
      // ⚠ `set_model` 只收 modelId，adapter / apiKey 由 `resolveModel` 补全 ——
      // 这里用户是在**一份完整的选择**上点的（`WorkflowModelPicker` 给的就是
      // 完整对象），所以直接把它交出去，⛔ 不让 op 再去猜一遍 adapter。
      const result = applyNodeAssistantOpV4(
        state,
        {
          op: NODE_ASSISTANT_OP_V4_IDS.setModel,
          target: nodeId,
          modelId: model.modelId,
        },
        {
          mintId: (prefix) => `${prefix}${crypto.randomUUID()}`,
          resolveModel: () => model,
        },
      )
      if (!result.ok) {
        const key = OP_FAILURE_KEYS[result.reason]
        toast.error(key ? t(key) : t('opFailed', { reason: result.reason }))
        return
      }
      // op 在有旧选择时只换 modelId（保留旧 adapter），而用户换的是整条路由 ——
      // 把这一份完整选择盖回去，否则换 provider 会留着上一家的 adapter。
      onStateChange({
        ...result.state,
        nodes: result.state.nodes.map((node) =>
          node.id === nodeId && node.data.kind !== 'text'
            ? { ...node, data: { ...node.data, model } }
            : node,
        ),
      })
    },
    [state, onStateChange, t],
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

  const onTidyLayout = useCallback(() => {
    onStateChange(tidyShotLanes(state))
  }, [state, onStateChange])

  const onSetMedia = useCallback(
    (nodeId: string, patch: NodeV4MediaPatch) => {
      // 媒体回填不是 op 表上的东西（助手不许直接塞 URL，§5 纪律 1）——它是用户
      // 自己传上来的那一份，所以走 state 直改，但**字段集就是 A 补进 schema 的
      // 那一组**，⛔ 不在这里另发明字段。
      onStateChange({
        ...state,
        nodes: state.nodes.map((node) =>
          node.id === nodeId && node.data.kind !== 'text'
            ? { ...node, data: { ...node.data, ...patch } }
            : node,
        ),
      })
    },
    [state, onStateChange],
  )

  const value = useMemo<NodeV4CanvasContextValue>(
    () => ({
      nodes: state.nodes,
      edges: state.edges,
      draggingFrom,
      changedNodeIds: changedNodeIds ?? [],
      selectedNodeIds: selectedNodeIds ?? [],
      expandedNodeId,
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
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
      onUndo,
      onRedo,
    }),
    [
      state.nodes,
      state.edges,
      draggingFrom,
      changedNodeIds,
      selectedNodeIds,
      expandedNodeId,
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
      undoStack.length,
      redoStack.length,
      onUndo,
      onRedo,
    ],
  )

  return <NodeV4CanvasProvider value={value}>{children}</NodeV4CanvasProvider>
}
