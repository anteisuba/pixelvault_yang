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

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import type { NodeSlotId } from '@/constants/node-slots'
import type { NodeWorkflowMediaKind } from '@/constants/node-types'
import { applyNodeAssistantOpV4 } from '@/lib/node-assistant-op-apply-v4'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type {
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

export interface NodeV4ProviderProps {
  readonly state: NodeWorkflowStateV4
  /** 应用一条 op 之后的新 state。调用方负责持久化（预览路径下不写库）。 */
  onStateChange(next: NodeWorkflowStateV4): void
  readonly draggingFrom?: string | null
  readonly changedNodeIds?: readonly string[]
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
  modelOptionsByKind,
  onFocusNode,
  onDeriveFromText,
  children,
}: NodeV4ProviderProps) {
  const t = useTranslations('StudioNode.v4')
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null)

  const dispatch = useCallback(
    (op: NodeAssistantOpV4): boolean => {
      const result = applyNodeAssistantOpV4(state, op, {
        mintId: (prefix) => `${prefix}${crypto.randomUUID()}`,
      })
      if (!result.ok) {
        const key = OP_FAILURE_KEYS[result.reason]
        toast.error(key ? t(key) : t('opFailed', { reason: result.reason }))
        return false
      }
      onStateChange(result.state)
      return true
    },
    [state, onStateChange, t],
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
    }),
    [
      state.nodes,
      state.edges,
      draggingFrom,
      changedNodeIds,
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
    ],
  )

  return <NodeV4CanvasProvider value={value}>{children}</NodeV4CanvasProvider>
}
