'use client'

import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react'
import { useCallback, useMemo, useState } from 'react'

import type {
  NodeWorkflowEdge,
  NodeWorkflowModelSelection,
  NodeWorkflowNode,
  NodeWorkflowNodeData,
  NodeWorkflowNodeType,
  NodeWorkflowPosition,
  NodeWorkflowState,
  ScriptBreakdownResult,
} from '@/types'

function createWorkflowNodeId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `node_${Date.now()}`
}

function createWorkflowNode(
  type: NodeWorkflowNodeType,
  position: NodeWorkflowPosition,
): NodeWorkflowNode {
  return {
    id: createWorkflowNodeId(),
    type,
    position,
    data: { prompt: '' },
  }
}

interface UseNodeWorkflowReturn extends NodeWorkflowState {
  selectedNodeId: string | null
  addNode: (
    type: NodeWorkflowNodeType,
    position: NodeWorkflowPosition,
  ) => NodeWorkflowNode
  openNodeEditor: (nodeId: string) => void
  closeNodeEditor: () => void
  updateNodeData: (nodeId: string, patch: Partial<NodeWorkflowNodeData>) => void
  updateNodeModel: (nodeId: string, model: NodeWorkflowModelSelection) => void
  updateScriptBreakdown: (
    nodeId: string,
    breakdown: ScriptBreakdownResult,
    planner: { label: string; modelId: string },
  ) => void
  onNodesChange: (changes: NodeChange<NodeWorkflowNode>[]) => void
  onEdgesChange: (changes: EdgeChange<NodeWorkflowEdge>[]) => void
  onConnect: (connection: Connection) => void
}

export function useNodeWorkflow(): UseNodeWorkflowReturn {
  const [state, setState] = useState<NodeWorkflowState>({
    nodes: [],
    edges: [],
    editorNodeId: null,
  })

  const selectedNodeId = useMemo(
    () => state.nodes.find((node) => node.selected)?.id ?? null,
    [state.nodes],
  )

  const addNode = useCallback(
    (type: NodeWorkflowNodeType, position: NodeWorkflowPosition) => {
      const node = createWorkflowNode(type, position)
      setState((current) => ({
        ...current,
        nodes: [
          ...current.nodes.map((existing) =>
            existing.selected ? { ...existing, selected: false } : existing,
          ),
          { ...node, selected: true },
        ],
      }))
      return node
    },
    [],
  )

  const openNodeEditor = useCallback((nodeId: string) => {
    setState((current) => ({ ...current, editorNodeId: nodeId }))
  }, [])

  const closeNodeEditor = useCallback(() => {
    setState((current) => ({ ...current, editorNodeId: null }))
  }, [])

  const updateNodeData = useCallback(
    (nodeId: string, patch: Partial<NodeWorkflowNodeData>) => {
      setState((current) => ({
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, ...patch } }
            : node,
        ),
      }))
    },
    [],
  )

  const updateNodeModel = useCallback(
    (nodeId: string, model: NodeWorkflowModelSelection) => {
      updateNodeData(nodeId, { model })
    },
    [updateNodeData],
  )

  const updateScriptBreakdown = useCallback(
    (
      nodeId: string,
      breakdown: ScriptBreakdownResult,
      planner: { label: string; modelId: string },
    ) => {
      updateNodeData(nodeId, {
        breakdown,
        plannerLabel: planner.label,
        plannerModelId: planner.modelId,
      })
    },
    [updateNodeData],
  )

  const onNodesChange = useCallback(
    (changes: NodeChange<NodeWorkflowNode>[]) => {
      setState((current) => ({
        ...current,
        nodes: applyNodeChanges(changes, current.nodes),
      }))
    },
    [],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange<NodeWorkflowEdge>[]) => {
      setState((current) => ({
        ...current,
        edges: applyEdgeChanges(changes, current.edges),
      }))
    },
    [],
  )

  const onConnect = useCallback((connection: Connection) => {
    setState((current) => ({
      ...current,
      edges: addEdge(connection, current.edges),
    }))
  }, [])

  return {
    ...state,
    selectedNodeId,
    addNode,
    openNodeEditor,
    closeNodeEditor,
    updateNodeData,
    updateNodeModel,
    updateScriptBreakdown,
    onNodesChange,
    onEdgesChange,
    onConnect,
  }
}
