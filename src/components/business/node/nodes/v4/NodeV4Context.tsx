'use client'

/**
 * v4 节点渲染需要的画布上下文（node-canvas-v2 §2 / §3）。
 *
 * ReactFlow 只把 `data` 递给节点组件，但 v4 的槽格要显示**上游节点的缩略**、
 * 拖线时要知道**当前源是谁**才能决定点不点亮——两件都要整张图。所以这里给一份
 * 只读上下文，⛔ 不在每个节点的 `data` 里塞一份图的拷贝（那会让每次连线都把所有
 * 节点标脏）。
 */

import { createContext, useContext, type ReactNode } from 'react'

import type { NodeSlotId } from '@/constants/node-slots'
import type { NodeWorkflowMediaKind } from '@/constants/node-types'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type {
  NodeV4,
  NodeV4GenerationParams,
  NodeWorkflowEdgeV4,
  NodeWorkflowModelOption,
  NodeWorkflowModelSelection,
} from '@/types/node-workflow'

/**
 * 上传 / 生成回填的媒体补丁（C3c-① A 补进 schema 的那一组字段）。
 * ⚠ 字段集与 `NodeV4MediaMetaShape` 同源，⛔ 不在 UI 层另发明字段。
 */
export interface NodeV4MediaPatch {
  readonly url?: string
  readonly videoThumbnailUrl?: string
  readonly sizeBytes?: number
  readonly mediaWidth?: number
  readonly mediaHeight?: number
  readonly imageSource?: 'generated' | 'existing'
}

export interface NodeV4CanvasContextValue {
  readonly nodes: readonly NodeV4[]
  readonly edges: readonly NodeWorkflowEdgeV4[]
  /** 正在拖线的源节点 id（`null` = 没在拖）。决定哪些入口槽点亮。 */
  readonly draggingFrom: string | null
  /** 助手这一轮改动过的节点 —— §7 变更高亮。 */
  readonly changedNodeIds: readonly string[]
  /** 就地展开的那一个节点（同一时刻最多一个，§2.3）。 */
  readonly expandedNodeId: string | null
  /**
   * 画布上当前选中的节点（ReactFlow 的选中集）。
   *
   * ⚠ 节点自己的 `selected` prop 只回答「我被选中了吗」，回答不了「一共选了
   * 几个」——而多选时每张卡都弹一条自己的工具条正是 v3 的老毛病。所以选中集
   * 整份给到卡里，`size >= 2` 时各卡收起自己的工具条（legacy `multiSelectActive`
   * 的同一条判据）。
   */
  readonly selectedNodeIds: readonly string[]
  onToggleExpanded(nodeId: string): void
  onSelectSlotVersion(nodeId: string, slot: NodeSlotId, versionId: string): void
  onDisconnectSlot(nodeId: string, slot: NodeSlotId, versionId: string): void
  /** 点槽内内容 = 高亮并平移到源节点（不是打开，避免误操作，§3.4）。 */
  onFocusNode(nodeId: string): void
  onEditText(nodeId: string, body: string): void
  /** 文本节点工具条的五个派生动作（§8）。 */
  onDeriveFromText(nodeId: string, action: NodeTextDeriveAction): void

  /* ── 生成编排区（§2 展开态底部）需要的四件 ───────────────────────────
   * ⚠ 它们与上面六个回调**同一条路径**：都由 `NodeV4Provider` 落到
   * `applyNodeAssistantOpV4` 的 op 表上（`set_prompt` / `set_model` /
   * `set_params`），⛔ 不给编排区开一条自己的写入通道。`onSetMedia` 例外，
   * 见 Provider 里那条注释（助手不许塞 URL，它只走用户上传）。 */
  /** 每个 kind 可选的模型清单。空 = 该模态整栏不渲染（Hard Rule 8 的组级不可用）。 */
  readonly modelOptionsByKind: Partial<
    Record<NodeWorkflowMediaKind, NodeWorkflowModelOption[]>
  >
  onSetPrompt(nodeId: string, prompt: string): void
  onSetModel(nodeId: string, model: NodeWorkflowModelSelection): void
  onSetParams(nodeId: string, params: NodeV4GenerationParams): void
  onSetMedia(nodeId: string, patch: NodeV4MediaPatch): void

  /**
   * 通用 op 出口：把**任意一条** v4 op 交给 Provider 的同一条路径
   * （`applyNodeAssistantOpV4` + 失败 toast）。
   *
   * ⚠ 存在理由：上面那些具名回调是「常用动作的短名」，但展开态还要发
   * `delete` / `clone` / `move_to_shot` / `connect` 这类**一次性**的 op，为每一条
   * 再加一个具名回调只会让契约越来越长。⛔ 但不要拿它绕开已有具名回调——
   * 同一个动作两个入口，撤销粒度就会漂。
   */
  onApplyOp(op: NodeAssistantOpV4): Promise<void> | void
  /**
   * 按镜头带重排（`tidyShotLanes`）。⚠ 不是 op —— 它只动坐标、不动图的语义，
   * 走 op 表会给每次「整理」产生一条与内容无关的撤销记录。
   */
  onTidyLayout(): void

  /**
   * 撤销 / 重做（§7，走 op inverses）。
   *
   * ⚠ `canUndo` / `canRedo` 摆进契约是为了让入口能**置灰而不是消失**：一个时有时无
   * 的撤销键会让用户以为自己刚才那步没被记下来。
   */
  readonly canUndo: boolean
  readonly canRedo: boolean
  onUndo(): void
  onRedo(): void
}

export const NODE_TEXT_DERIVE_ACTIONS = [
  'shotImage',
  'video',
  'character',
  'background',
  'askAssistant',
] as const

export type NodeTextDeriveAction = (typeof NODE_TEXT_DERIVE_ACTIONS)[number]

const NodeV4CanvasContext = createContext<NodeV4CanvasContextValue | null>(null)

export function NodeV4CanvasProvider({
  value,
  children,
}: {
  value: NodeV4CanvasContextValue
  children: ReactNode
}) {
  return (
    <NodeV4CanvasContext.Provider value={value}>
      {children}
    </NodeV4CanvasContext.Provider>
  )
}

/**
 * ⚠ 缺 provider 时**抛错**，不给一份空默认值：空默认值会让槽格静默显示成「什么
 * 都没连」，而那正是最难查的一类画布 bug。
 */
export function useNodeV4Canvas(): NodeV4CanvasContextValue {
  const value = useContext(NodeV4CanvasContext)
  if (!value) {
    throw new Error(
      'useNodeV4Canvas must be used inside <NodeV4CanvasProvider>',
    )
  }
  return value
}
