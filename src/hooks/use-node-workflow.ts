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
  NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS,
  NODE_STUDIO_ID_PREFIXES,
  NODE_STUDIO_NODE_PLACEMENT,
  NODE_STUDIO_WORKFLOW_STORAGE,
} from '@/constants/node-studio'
import {
  NODE_GENERATION_STATUS_IDS,
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
import type {
  ScriptBreakdownPlanner,
  ScriptBreakdownResult,
} from '@/types/script-breakdown'

export const EMPTY_NODE_WORKFLOW_STATE: NodeWorkflowState = {
  nodes: [],
  edges: [],
}

export interface NodeWorkflowActions {
  updateNodeData(id: string, patch: Partial<NodeWorkflowNodeData>): void
  updateScriptBreakdown(
    nodeId: string,
    breakdown: ScriptBreakdownResult,
    planner: ScriptBreakdownPlanner,
  ): void
  spawnCharactersFromBreakdown(agentNodeId: string): SpawnCharactersResult
  deleteNode(id: string): void
}

export interface SpawnCharactersResult {
  createdNodeIds: string[]
  skippedCharacterIds: string[]
}

interface UseNodeWorkflowValue extends NodeWorkflowActions {
  state: NodeWorkflowState
  nodes: NodeWorkflowNode[]
  edges: NodeWorkflowEdge[]
  addNode(type: NodeWorkflowNodeType, position: XYPosition): string
  getOutgoingTargetByType(
    sourceId: string,
    targetType: NodeWorkflowNodeType,
  ): NodeWorkflowNode | null
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

  if (type === NODE_TYPE_IDS.characterImage) {
    return {
      prompt: '',
      status: NODE_STATUS_IDS.idle,
      generationStatus: NODE_GENERATION_STATUS_IDS.idle,
      imageMode: NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.choice,
      referenceAssets: [],
      loras: [],
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
      if (!hasHydrated.current) {
        hasPreHydrationMutation.current = true
      }

      const nextState = updater(stateRef.current)
      stateRef.current = nextState
      setState(nextState)
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

  const updateScriptBreakdown = useCallback(
    (
      nodeId: string,
      breakdown: ScriptBreakdownResult,
      planner: ScriptBreakdownPlanner,
    ) => {
      setWorkflowState((currentState) => ({
        ...currentState,
        nodes: currentState.nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  breakdown,
                  planner,
                  plannerLabel: planner.label,
                  plannerModelId: planner.modelId,
                  generationError: undefined,
                  status: NODE_STATUS_IDS.done,
                },
              }
            : node,
        ),
      }))
    },
    [setWorkflowState],
  )

  const spawnCharactersFromBreakdown = useCallback(
    (agentNodeId: string): SpawnCharactersResult => {
      const currentState = stateRef.current
      const agentNode = currentState.nodes.find(
        (node) => node.id === agentNodeId && node.type === NODE_TYPE_IDS.agent,
      )
      const breakdown = agentNode?.data.breakdown

      if (!agentNode || !breakdown) {
        return {
          createdNodeIds: [],
          skippedCharacterIds: [],
        }
      }

      const existingCharacterIds = new Set(
        currentState.nodes
          .filter((node) => node.type === NODE_TYPE_IDS.characterImage)
          .map((node) => node.data.character?.characterId)
          .filter((characterId): characterId is string => Boolean(characterId)),
      )
      const skippedCharacterIds: string[] = []
      const createdNodes: NodeWorkflowNode[] = []
      const createdEdges: NodeWorkflowEdge[] = []
      const { offsetX, offsetY } = NODE_STUDIO_NODE_PLACEMENT.characterSpawn
      const firstY =
        agentNode.position.y - ((breakdown.characters.length - 1) * offsetY) / 2

      breakdown.characters.forEach((character, characterIndex) => {
        if (existingCharacterIds.has(character.id)) {
          skippedCharacterIds.push(character.id)
          return
        }

        const nodeId = createWorkflowId(NODE_STUDIO_ID_PREFIXES.node)
        const edgeId = createWorkflowId(NODE_STUDIO_ID_PREFIXES.edge)
        createdNodes.push({
          id: nodeId,
          type: NODE_TYPE_IDS.characterImage,
          position: {
            x: agentNode.position.x + offsetX,
            y: firstY + characterIndex * offsetY,
          },
          data: {
            prompt: character.visualSeed,
            status: NODE_STATUS_IDS.idle,
            generationStatus: NODE_GENERATION_STATUS_IDS.idle,
            imageMode: NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.choice,
            referenceAssets: [],
            loras: [],
            character: {
              characterId: character.id,
              name: character.nameSuggestion || character.label,
              visualSeed: character.visualSeed,
            },
          },
        })
        createdEdges.push({
          id: edgeId,
          source: agentNodeId,
          target: nodeId,
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
        })
      })

      if (createdNodes.length === 0) {
        return {
          createdNodeIds: [],
          skippedCharacterIds,
        }
      }

      setWorkflowState((latestState) => ({
        ...latestState,
        nodes: [...latestState.nodes, ...createdNodes],
        edges: [...latestState.edges, ...createdEdges],
      }))

      return {
        createdNodeIds: createdNodes.map((node) => node.id),
        skippedCharacterIds,
      }
    },
    [setWorkflowState],
  )

  const getOutgoingTargetByType = useCallback(
    (sourceId: string, targetType: NodeWorkflowNodeType) => {
      const currentState = stateRef.current
      for (const edge of currentState.edges) {
        if (edge.source !== sourceId) {
          continue
        }

        const targetNode = currentState.nodes.find(
          (node) => node.id === edge.target && node.type === targetType,
        )

        if (targetNode) {
          return targetNode
        }
      }

      return null
    },
    [],
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
      updateScriptBreakdown,
      spawnCharactersFromBreakdown,
      deleteNode,
      getOutgoingTargetByType,
      onNodesChange,
      onEdgesChange,
      onConnect,
    }),
    [
      addNode,
      deleteNode,
      getOutgoingTargetByType,
      onConnect,
      onEdgesChange,
      onNodesChange,
      state,
      spawnCharactersFromBreakdown,
      updateScriptBreakdown,
      updateNodeData,
    ],
  )
}
