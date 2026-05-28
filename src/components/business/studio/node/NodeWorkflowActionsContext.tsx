'use client'

import { createContext, useContext, type ReactNode } from 'react'

import type { NodeWorkflowActions } from '@/hooks/node/use-node-workflow'
import type { NodeWorkflowModelOptionsByType } from '@/types/node-workflow'

export interface NodeWorkflowCanvasActions extends NodeWorkflowActions {
  sendFromComposer?(composerNodeId: string): Promise<void>
  generateCharacterImage?(nodeId: string): Promise<void>
  generateMediaNode?(nodeId: string): Promise<void>
  modelOptionsByType: NodeWorkflowModelOptionsByType
}

const NodeWorkflowActionsContext =
  createContext<NodeWorkflowCanvasActions | null>(null)

interface NodeWorkflowActionsProviderProps {
  value: NodeWorkflowCanvasActions
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

export function useNodeWorkflowActions(): NodeWorkflowCanvasActions {
  const context = useContext(NodeWorkflowActionsContext)
  if (!context) {
    throw new Error('NodeWorkflowActionsProvider is missing')
  }

  return context
}
