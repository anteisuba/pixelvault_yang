'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type OnEdgesChange,
  type OnNodesChange,
  type XYPosition,
} from '@xyflow/react'

import {
  NODE_STUDIO_EDGE_VISUALS,
  NODE_STUDIO_ID_PREFIXES,
  NODE_STUDIO_WORKFLOW_STORAGE,
} from '@/constants/node-studio'
import {
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import {
  NodeWorkflowStateSchema,
  type NodeWorkflowEdge,
  type NodeWorkflowNode,
  type NodeWorkflowNodeData,
  type NodeWorkflowState,
} from '@/types/node-workflow'

export const EMPTY_NODE_WORKFLOW_STATE: NodeWorkflowState = {
  nodes: [],
  edges: [],
}

export interface NodeWorkflowActions {
  updateNodeData(id: string, patch: Partial<NodeWorkflowNodeData>): void
  deleteNode(id: string): void
}

interface UseNodeWorkflowValue extends NodeWorkflowActions {
  state: NodeWorkflowState
  nodes: NodeWorkflowNode[]
  edges: NodeWorkflowEdge[]
  addNode(type: NodeWorkflowNodeType, position: XYPosition): string
  onNodesChange: OnNodesChange<NodeWorkflowNode>
  onEdgesChange: OnEdgesChange<NodeWorkflowEdge>
  onConnect(connection: Connection): void
}

let fallbackIdSequence = 0

function createWorkflowId(prefix: string): string {
  const randomId = globalThis.crypto?.randomUUID?.()
  if (randomId) {
    return `${prefix}-${randomId}`
  }

  fallbackIdSequence += 1
  return `${prefix}-${Date.now()}-${fallbackIdSequence}`
}

function createDefaultNodeData(
  type: NodeWorkflowNodeType,
): NodeWorkflowNodeData {
  if (type === NODE_TYPE_IDS.composer) {
    return {
      prompt: '',
      status: NODE_STATUS_IDS.idle,
    }
  }

  return {
    prompt: '',
    status: NODE_STATUS_IDS.idle,
  }
}

function readWorkflowStateFromStorage(): NodeWorkflowState {
  if (typeof window === 'undefined') {
    return EMPTY_NODE_WORKFLOW_STATE
  }

  try {
    const raw = window.localStorage.getItem(NODE_STUDIO_WORKFLOW_STORAGE.key)
    if (!raw) {
      return EMPTY_NODE_WORKFLOW_STATE
    }

    const parsedJson = JSON.parse(raw) as unknown
    const parsed = NodeWorkflowStateSchema.safeParse(parsedJson)
    if (!parsed.success) {
      return EMPTY_NODE_WORKFLOW_STATE
    }

    return {
      nodes: parsed.data.nodes,
      edges: parsed.data.edges,
    }
  } catch {
    return EMPTY_NODE_WORKFLOW_STATE
  }
}

function writeWorkflowStateToStorage(state: NodeWorkflowState): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(
      NODE_STUDIO_WORKFLOW_STORAGE.key,
      JSON.stringify({
        ...state,
        version: NODE_STUDIO_WORKFLOW_STORAGE.version,
      }),
    )
  } catch {
    return
  }
}

export function useNodeWorkflow(): UseNodeWorkflowValue {
  const [state, setState] = useState<NodeWorkflowState>(
    EMPTY_NODE_WORKFLOW_STATE,
  )
  const stateRef = useRef<NodeWorkflowState>(EMPTY_NODE_WORKFLOW_STATE)
  const hasHydrated = useRef(false)
  const hasPreHydrationMutation = useRef(false)

  const setWorkflowState = useCallback(
    (updater: (currentState: NodeWorkflowState) => NodeWorkflowState) => {
      setState((currentState) => {
        if (!hasHydrated.current) {
          hasPreHydrationMutation.current = true
        }

        const nextState = updater(currentState)
        stateRef.current = nextState
        return nextState
      })
    },
    [],
  )

  useEffect(() => {
    let cancelled = false
    let preHydrationSaveTimeout: number | undefined

    window.queueMicrotask(() => {
      if (cancelled) {
        return
      }

      hasHydrated.current = true

      if (hasPreHydrationMutation.current) {
        preHydrationSaveTimeout = window.setTimeout(() => {
          writeWorkflowStateToStorage(stateRef.current)
        }, NODE_STUDIO_WORKFLOW_STORAGE.debounceMs)
        return
      }

      const hydratedState = readWorkflowStateFromStorage()
      stateRef.current = hydratedState
      setState(hydratedState)
    })

    return () => {
      cancelled = true
      if (preHydrationSaveTimeout !== undefined) {
        window.clearTimeout(preHydrationSaveTimeout)
      }
    }
  }, [])

  useEffect(() => {
    if (!hasHydrated.current) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      writeWorkflowStateToStorage(state)
    }, NODE_STUDIO_WORKFLOW_STORAGE.debounceMs)

    return () => window.clearTimeout(timeoutId)
  }, [state])

  const addNode = useCallback(
    (type: NodeWorkflowNodeType, position: XYPosition) => {
      const nodeId = createWorkflowId(NODE_STUDIO_ID_PREFIXES.node)
      const nextNode: NodeWorkflowNode = {
        id: nodeId,
        type,
        position,
        data: createDefaultNodeData(type),
      }

      setWorkflowState((currentState) => ({
        ...currentState,
        nodes: [...currentState.nodes, nextNode],
      }))

      return nodeId
    },
    [setWorkflowState],
  )

  const updateNodeData = useCallback(
    (id: string, patch: Partial<NodeWorkflowNodeData>) => {
      setWorkflowState((currentState) => ({
        ...currentState,
        nodes: currentState.nodes.map((node) =>
          node.id === id
            ? {
                ...node,
                data: {
                  ...node.data,
                  ...patch,
                },
              }
            : node,
        ),
      }))
    },
    [setWorkflowState],
  )

  const deleteNode = useCallback(
    (id: string) => {
      setWorkflowState((currentState) => ({
        nodes: currentState.nodes.filter((node) => node.id !== id),
        edges: currentState.edges.filter(
          (edge) => edge.source !== id && edge.target !== id,
        ),
      }))
    },
    [setWorkflowState],
  )

  const onNodesChange = useCallback<OnNodesChange<NodeWorkflowNode>>(
    (changes) => {
      setWorkflowState((currentState) => ({
        ...currentState,
        nodes: applyNodeChanges(changes, currentState.nodes),
      }))
    },
    [setWorkflowState],
  )

  const onEdgesChange = useCallback<OnEdgesChange<NodeWorkflowEdge>>(
    (changes) => {
      setWorkflowState((currentState) => ({
        ...currentState,
        edges: applyEdgeChanges(changes, currentState.edges),
      }))
    },
    [setWorkflowState],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      const edgeId = createWorkflowId(NODE_STUDIO_ID_PREFIXES.edge)
      setWorkflowState((currentState) => ({
        ...currentState,
        edges: addEdge(
          {
            ...connection,
            id: edgeId,
            type: NODE_STUDIO_EDGE_VISUALS.type,
            interactionWidth: NODE_STUDIO_EDGE_VISUALS.interactionWidth,
            markerEnd: {
              type: NODE_STUDIO_EDGE_VISUALS.markerEndType,
              color: NODE_STUDIO_EDGE_VISUALS.color,
              width: NODE_STUDIO_EDGE_VISUALS.markerSize,
              height: NODE_STUDIO_EDGE_VISUALS.markerSize,
              strokeWidth: NODE_STUDIO_EDGE_VISUALS.markerStrokeWidth,
            },
            style: {
              stroke: NODE_STUDIO_EDGE_VISUALS.color,
              strokeWidth: NODE_STUDIO_EDGE_VISUALS.strokeWidth,
              filter: NODE_STUDIO_EDGE_VISUALS.glowFilter,
            },
          },
          currentState.edges,
        ),
      }))
    },
    [setWorkflowState],
  )

  return useMemo(
    () => ({
      state,
      nodes: state.nodes,
      edges: state.edges,
      addNode,
      updateNodeData,
      deleteNode,
      onNodesChange,
      onEdgesChange,
      onConnect,
    }),
    [
      addNode,
      deleteNode,
      onConnect,
      onEdgesChange,
      onNodesChange,
      state,
      updateNodeData,
    ],
  )
}
