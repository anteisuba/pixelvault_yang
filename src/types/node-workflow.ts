import type { Edge, Node } from '@xyflow/react'

import type { AI_ADAPTER_TYPES, ProviderConfig } from '@/constants/providers'
import type { ScriptBreakdownResult } from '@/types/script-breakdown'

export const NODE_WORKFLOW_NODE_TYPES = [
  'composer',
  'agent',
  'shot',
  'shotText',
  'characterImage',
  'backgroundImage',
  'frameImage',
  'voice',
  'seedance',
  'text',
  'image',
  'video',
  'audio',
] as const

export type NodeWorkflowNodeType = (typeof NODE_WORKFLOW_NODE_TYPES)[number]

export interface NodeWorkflowPosition {
  x: number
  y: number
}

export interface NodeWorkflowModelSelection {
  optionId: string
  modelId: string
  adapterType: AI_ADAPTER_TYPES
  providerConfig: ProviderConfig
  apiKeyId?: string
  label?: string
}

export type NodeWorkflowNodeData = {
  prompt: string
  model?: NodeWorkflowModelSelection
  breakdown?: ScriptBreakdownResult
  plannerLabel?: string
  plannerModelId?: string
} & Record<string, unknown>

export type NodeWorkflowNode = Node<NodeWorkflowNodeData, NodeWorkflowNodeType>
export type NodeWorkflowEdge = Edge

export interface NodeWorkflowState {
  nodes: NodeWorkflowNode[]
  edges: NodeWorkflowEdge[]
  editorNodeId: string | null
}
