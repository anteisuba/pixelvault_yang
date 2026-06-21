'use client'

import { createContext, useContext, type ReactNode } from 'react'

import type { NodeStudioToolMode } from '@/constants/node-studio'
import type { NodeWorkflowActions } from '@/hooks/node/use-node-workflow'
import type {
  NodeWorkflowModelOptionsByType,
  VideoDefaultModel,
} from '@/types/node-workflow'

export interface NodeWorkflowCanvasActions extends NodeWorkflowActions {
  generateCharacterImage?(nodeId: string): Promise<void>
  generateMediaNode?(nodeId: string): Promise<void>
  /**
   * AI-enhance a video (Seedance) node's prompt in place: reads the node's
   * current prompt + upstream references, runs the seedance-prompt-plan
   * planner (assistant's auto LLM route), and writes the orchestrated
   * finalPrompt / motion / camera / duration / timeline back onto the same
   * node. This is the home of the retired Agent node's `seedancePrompt` mode.
   */
  enhanceSeedancePrompt?(nodeId: string): Promise<void>
  focusGeneratedNodes?(): void
  toolMode: NodeStudioToolMode
  setToolMode(mode: NodeStudioToolMode): void
  /**
   * The node whose ⤢ detail panel is open, or null. Lifted to the workbench
   * so a single shared floating panel renders the one expanded node — nodes
   * (rendered by ReactFlow `nodeTypes`, no props) read/set it through context.
   */
  expandedNodeId: string | null
  setExpandedNodeId(id: string | null): void
  modelOptionsByType: NodeWorkflowModelOptionsByType
  /** Canvas-default video model (two-tier {brand,variant}); new video nodes
   *  inherit it via the autospawn effect. Set from the topbar chip. */
  defaultVideoModel: VideoDefaultModel | undefined
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
