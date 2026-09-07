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
import type { NodeV4, NodeWorkflowEdgeV4 } from '@/types/node-workflow'

export interface NodeV4CanvasContextValue {
  readonly nodes: readonly NodeV4[]
  readonly edges: readonly NodeWorkflowEdgeV4[]
  /** 正在拖线的源节点 id（`null` = 没在拖）。决定哪些入口槽点亮。 */
  readonly draggingFrom: string | null
  /** 助手这一轮改动过的节点 —— §7 变更高亮。 */
  readonly changedNodeIds: readonly string[]
  /** 就地展开的那一个节点（同一时刻最多一个，§2.3）。 */
  readonly expandedNodeId: string | null
  onToggleExpanded(nodeId: string): void
  onSelectSlotVersion(nodeId: string, slot: NodeSlotId, versionId: string): void
  onDisconnectSlot(nodeId: string, slot: NodeSlotId, versionId: string): void
  /** 点槽内内容 = 高亮并平移到源节点（不是打开，避免误操作，§3.4）。 */
  onFocusNode(nodeId: string): void
  onEditText(nodeId: string, body: string): void
  /** 文本节点工具条的五个派生动作（§8）。 */
  onDeriveFromText(nodeId: string, action: NodeTextDeriveAction): void
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
