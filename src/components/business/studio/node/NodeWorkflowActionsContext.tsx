'use client'

import { createContext, useContext, type ReactNode } from 'react'

import type { StudioModelOption } from '@/components/business/ModelSelector'
import type {
  NodeWorkflowModelSelection,
  NodeWorkflowNodeData,
  NodeWorkflowNodeType,
} from '@/types'

export interface NodeWorkflowActions {
  modelOptionsByType: Record<NodeWorkflowNodeType, StudioModelOption[]>
  isLoading: boolean
  updateNodeData: (nodeId: string, patch: Partial<NodeWorkflowNodeData>) => void
  updateNodeModel: (nodeId: string, model: NodeWorkflowModelSelection) => void
  openNodeEditor: (nodeId: string) => void
  sendFromComposer: (composerNodeId: string) => Promise<void> | void
  hasOutgoingAgent: (composerNodeId: string) => boolean
}

const NodeWorkflowActionsContext = createContext<NodeWorkflowActions | null>(
  null,
)

export function NodeWorkflowActionsProvider({
  value,
  children,
}: {
  value: NodeWorkflowActions
  children: ReactNode
}) {
  return (
    <NodeWorkflowActionsContext.Provider value={value}>
      {children}
    </NodeWorkflowActionsContext.Provider>
  )
}

export function useNodeWorkflowActions(): NodeWorkflowActions {
  const ctx = useContext(NodeWorkflowActionsContext)
  if (!ctx) {
    throw new Error(
      'useNodeWorkflowActions must be used inside NodeWorkflowActionsProvider',
    )
  }
  return ctx
}
