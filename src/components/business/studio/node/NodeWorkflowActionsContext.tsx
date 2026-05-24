'use client'

import { createContext, useContext, type ReactNode } from 'react'

import type { NodeWorkflowActions } from '@/hooks/use-node-workflow'

const NodeWorkflowActionsContext = createContext<NodeWorkflowActions | null>(
  null,
)

interface NodeWorkflowActionsProviderProps {
  value: NodeWorkflowActions
  children: ReactNode
}

export function NodeWorkflowActionsProvider({
  value,
  children,
}: NodeWorkflowActionsProviderProps) {
  return (
    <NodeWorkflowActionsContext.Provider value={value}>
      {children}
    </NodeWorkflowActionsContext.Provider>
  )
}

export function useNodeWorkflowActions(): NodeWorkflowActions {
  const context = useContext(NodeWorkflowActionsContext)
  if (!context) {
    throw new Error('NodeWorkflowActionsProvider is missing')
  }

  return context
}
