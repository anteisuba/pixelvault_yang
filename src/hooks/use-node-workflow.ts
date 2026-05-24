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
  NODE_STUDIO_PROJECTS,
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
  NodeWorkflowStorageSchema,
  type NodeWorkflowEdge,
  type NodeWorkflowNode,
  type NodeWorkflowNodeData,
  type NodeWorkflowProject,
  type NodeWorkflowProjectSummary,
  type NodeWorkflowState,
  type NodeWorkflowStorageSnapshot,
} from '@/types/node-workflow'
import type {
  ScriptBreakdownPlanner,
  ScriptBreakdownResult,
} from '@/types/script-breakdown'

export const EMPTY_NODE_WORKFLOW_STATE: NodeWorkflowState = {
  nodes: [],
  edges: [],
}

export interface UseNodeWorkflowOptions {
  defaultProjectName: string
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
  projects: NodeWorkflowProjectSummary[]
  currentProjectId: string
  currentProjectName: string
  addNode(type: NodeWorkflowNodeType, position: XYPosition): string
  createProject(name: string): string
  switchProject(id: string): void
  renameCurrentProject(name: string): void
  deleteProject(id: string): NodeWorkflowProjectSummary | null
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

function createEmptyWorkflowState(): NodeWorkflowState {
  return {
    nodes: [],
    edges: [],
  }
}

function createWorkflowTimestamp(): string {
  return new Date().toISOString()
}

function normalizeProjectName(name: string, fallbackName: string): string {
  const trimmedName = name.trim()
  const trimmedFallback = fallbackName.trim()
  const resolvedName =
    trimmedName || trimmedFallback || NODE_STUDIO_PROJECTS.fallbackName

  return resolvedName.slice(0, NODE_STUDIO_PROJECTS.nameMaxLength)
}

function createWorkflowProject(
  name: string,
  state: NodeWorkflowState,
  timestamp = createWorkflowTimestamp(),
): NodeWorkflowProject {
  return {
    id: createWorkflowId(NODE_STUDIO_ID_PREFIXES.project),
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
    state,
  }
}

function createWorkflowStorageFromProject(
  project: NodeWorkflowProject,
): NodeWorkflowStorageSnapshot {
  return {
    version: NODE_STUDIO_WORKFLOW_STORAGE.version,
    currentProjectId: project.id,
    projects: [project],
  }
}

function createDefaultWorkflowStorage(
  defaultProjectName: string,
): NodeWorkflowStorageSnapshot {
  const normalizedName = normalizeProjectName(
    defaultProjectName,
    defaultProjectName,
  )

  return createWorkflowStorageFromProject(
    createWorkflowProject(normalizedName, createEmptyWorkflowState()),
  )
}

function createWorkflowStorageFromLegacyState(
  defaultProjectName: string,
  state: NodeWorkflowState,
): NodeWorkflowStorageSnapshot {
  const normalizedName = normalizeProjectName(
    defaultProjectName,
    defaultProjectName,
  )

  return createWorkflowStorageFromProject(
    createWorkflowProject(normalizedName, state),
  )
}

function getCurrentProject(
  storage: NodeWorkflowStorageSnapshot,
  defaultProjectName: string,
): NodeWorkflowProject {
  const currentProject =
    storage.projects.find(
      (project) => project.id === storage.currentProjectId,
    ) ?? storage.projects[0]

  if (currentProject) {
    return currentProject
  }

  return createWorkflowProject(
    normalizeProjectName(defaultProjectName, defaultProjectName),
    createEmptyWorkflowState(),
  )
}

function getProjectSummaries(
  projects: NodeWorkflowProject[],
): NodeWorkflowProjectSummary[] {
  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    nodeCount: project.state.nodes.length,
  }))
}

function patchCurrentProjectState(
  storage: NodeWorkflowStorageSnapshot,
  defaultProjectName: string,
  updater: (currentState: NodeWorkflowState) => NodeWorkflowState,
): NodeWorkflowStorageSnapshot {
  const currentProject = getCurrentProject(storage, defaultProjectName)
  const updatedAt = createWorkflowTimestamp()
  const nextProjects = storage.projects.map((project) =>
    project.id === currentProject.id
      ? {
          ...project,
          updatedAt,
          state: updater(project.state),
        }
      : project,
  )

  if (nextProjects.length > 0) {
    return {
      ...storage,
      currentProjectId: currentProject.id,
      projects: nextProjects,
    }
  }

  const replacementProject = createWorkflowProject(
    normalizeProjectName(defaultProjectName, defaultProjectName),
    updater(createEmptyWorkflowState()),
    updatedAt,
  )

  return createWorkflowStorageFromProject(replacementProject)
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

function readWorkflowStorageFromStorage(
  defaultProjectName: string,
): NodeWorkflowStorageSnapshot {
  if (typeof window === 'undefined') {
    return createDefaultWorkflowStorage(defaultProjectName)
  }

  try {
    const raw = window.localStorage.getItem(NODE_STUDIO_WORKFLOW_STORAGE.key)
    if (!raw) {
      return createDefaultWorkflowStorage(defaultProjectName)
    }

    const parsedJson = JSON.parse(raw) as unknown
    const parsedStorage = NodeWorkflowStorageSchema.safeParse(parsedJson)
    if (parsedStorage.success) {
      return parsedStorage.data
    }

    const parsedLegacyState = NodeWorkflowStateSchema.safeParse(parsedJson)
    if (parsedLegacyState.success) {
      return createWorkflowStorageFromLegacyState(defaultProjectName, {
        nodes: parsedLegacyState.data.nodes,
        edges: parsedLegacyState.data.edges,
      })
    }

    return createDefaultWorkflowStorage(defaultProjectName)
  } catch {
    return createDefaultWorkflowStorage(defaultProjectName)
  }
}

function writeWorkflowStorageToStorage(
  storage: NodeWorkflowStorageSnapshot,
): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(
      NODE_STUDIO_WORKFLOW_STORAGE.key,
      JSON.stringify(storage),
    )
  } catch {
    return
  }
}

export function useNodeWorkflow({
  defaultProjectName,
}: UseNodeWorkflowOptions): UseNodeWorkflowValue {
  const defaultStorage = useMemo(
    () => createDefaultWorkflowStorage(defaultProjectName),
    [defaultProjectName],
  )
  const [storageState, setStorageState] =
    useState<NodeWorkflowStorageSnapshot>(defaultStorage)
  const storageRef = useRef<NodeWorkflowStorageSnapshot>(defaultStorage)
  const hasHydrated = useRef(false)
  const hasPreHydrationMutation = useRef(false)

  const setWorkflowStorage = useCallback(
    (
      updater: (
        currentStorage: NodeWorkflowStorageSnapshot,
      ) => NodeWorkflowStorageSnapshot,
    ) => {
      if (!hasHydrated.current) {
        hasPreHydrationMutation.current = true
      }

      const nextStorage = updater(storageRef.current)
      storageRef.current = nextStorage
      setStorageState(nextStorage)
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
          writeWorkflowStorageToStorage(storageRef.current)
        }, NODE_STUDIO_WORKFLOW_STORAGE.debounceMs)
        return
      }

      const hydratedStorage = readWorkflowStorageFromStorage(defaultProjectName)
      storageRef.current = hydratedStorage
      setStorageState(hydratedStorage)
    })

    return () => {
      cancelled = true
      if (preHydrationSaveTimeout !== undefined) {
        window.clearTimeout(preHydrationSaveTimeout)
      }
    }
  }, [defaultProjectName])

  useEffect(() => {
    if (!hasHydrated.current) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      writeWorkflowStorageToStorage(storageState)
    }, NODE_STUDIO_WORKFLOW_STORAGE.debounceMs)

    return () => window.clearTimeout(timeoutId)
  }, [storageState])

  const currentProject = useMemo(
    () => getCurrentProject(storageState, defaultProjectName),
    [defaultProjectName, storageState],
  )
  const state = currentProject.state
  const projects = useMemo(
    () => getProjectSummaries(storageState.projects),
    [storageState.projects],
  )

  const addNode = useCallback(
    (type: NodeWorkflowNodeType, position: XYPosition) => {
      const nodeId = createWorkflowId(NODE_STUDIO_ID_PREFIXES.node)
      const nextNode: NodeWorkflowNode = {
        id: nodeId,
        type,
        position,
        data: createDefaultNodeData(type),
      }

      setWorkflowStorage((currentStorage) =>
        patchCurrentProjectState(
          currentStorage,
          defaultProjectName,
          (currentState) => ({
            ...currentState,
            nodes: [...currentState.nodes, nextNode],
          }),
        ),
      )

      return nodeId
    },
    [defaultProjectName, setWorkflowStorage],
  )

  const createProject = useCallback(
    (name: string) => {
      const timestamp = createWorkflowTimestamp()
      const normalizedName = normalizeProjectName(name, defaultProjectName)
      const project = createWorkflowProject(
        normalizedName,
        createEmptyWorkflowState(),
        timestamp,
      )

      setWorkflowStorage((currentStorage) => ({
        ...currentStorage,
        currentProjectId: project.id,
        projects: [...currentStorage.projects, project],
      }))

      return project.id
    },
    [defaultProjectName, setWorkflowStorage],
  )

  const switchProject = useCallback(
    (id: string) => {
      setWorkflowStorage((currentStorage) => {
        const targetProject = currentStorage.projects.find(
          (project) => project.id === id,
        )

        if (!targetProject) {
          return currentStorage
        }

        return {
          ...currentStorage,
          currentProjectId: id,
        }
      })
    },
    [setWorkflowStorage],
  )

  const renameCurrentProject = useCallback(
    (name: string) => {
      setWorkflowStorage((currentStorage) => {
        const current = getCurrentProject(currentStorage, defaultProjectName)
        const normalizedName = normalizeProjectName(name, current.name)
        const updatedAt = createWorkflowTimestamp()

        return {
          ...currentStorage,
          currentProjectId: current.id,
          projects: currentStorage.projects.map((project) =>
            project.id === current.id
              ? {
                  ...project,
                  name: normalizedName,
                  updatedAt,
                }
              : project,
          ),
        }
      })
    },
    [defaultProjectName, setWorkflowStorage],
  )

  const deleteProject = useCallback(
    (id: string): NodeWorkflowProjectSummary | null => {
      const targetProject = storageRef.current.projects.find(
        (project) => project.id === id,
      )

      if (!targetProject) {
        return null
      }

      setWorkflowStorage((currentStorage) => {
        const remainingProjects = currentStorage.projects.filter(
          (project) => project.id !== id,
        )

        if (remainingProjects.length === currentStorage.projects.length) {
          return currentStorage
        }

        const nextProject = remainingProjects[0]
        if (!nextProject) {
          return createDefaultWorkflowStorage(defaultProjectName)
        }

        return {
          ...currentStorage,
          currentProjectId:
            currentStorage.currentProjectId === id
              ? nextProject.id
              : currentStorage.currentProjectId,
          projects: remainingProjects,
        }
      })

      return getProjectSummaries([targetProject])[0] ?? null
    },
    [defaultProjectName, setWorkflowStorage],
  )

  const updateNodeData = useCallback(
    (id: string, patch: Partial<NodeWorkflowNodeData>) => {
      setWorkflowStorage((currentStorage) =>
        patchCurrentProjectState(
          currentStorage,
          defaultProjectName,
          (currentState) => ({
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
          }),
        ),
      )
    },
    [defaultProjectName, setWorkflowStorage],
  )

  const deleteNode = useCallback(
    (id: string) => {
      setWorkflowStorage((currentStorage) =>
        patchCurrentProjectState(
          currentStorage,
          defaultProjectName,
          (currentState) => ({
            nodes: currentState.nodes.filter((node) => node.id !== id),
            edges: currentState.edges.filter(
              (edge) => edge.source !== id && edge.target !== id,
            ),
          }),
        ),
      )
    },
    [defaultProjectName, setWorkflowStorage],
  )

  const updateScriptBreakdown = useCallback(
    (
      nodeId: string,
      breakdown: ScriptBreakdownResult,
      planner: ScriptBreakdownPlanner,
    ) => {
      setWorkflowStorage((currentStorage) =>
        patchCurrentProjectState(
          currentStorage,
          defaultProjectName,
          (currentState) => ({
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
          }),
        ),
      )
    },
    [defaultProjectName, setWorkflowStorage],
  )

  const spawnCharactersFromBreakdown = useCallback(
    (agentNodeId: string): SpawnCharactersResult => {
      const currentState = getCurrentProject(
        storageRef.current,
        defaultProjectName,
      ).state
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

      setWorkflowStorage((latestStorage) =>
        patchCurrentProjectState(
          latestStorage,
          defaultProjectName,
          (latestState) => ({
            ...latestState,
            nodes: [...latestState.nodes, ...createdNodes],
            edges: [...latestState.edges, ...createdEdges],
          }),
        ),
      )

      return {
        createdNodeIds: createdNodes.map((node) => node.id),
        skippedCharacterIds,
      }
    },
    [defaultProjectName, setWorkflowStorage],
  )

  const getOutgoingTargetByType = useCallback(
    (sourceId: string, targetType: NodeWorkflowNodeType) => {
      const currentState = getCurrentProject(
        storageRef.current,
        defaultProjectName,
      ).state
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
    [defaultProjectName],
  )

  const onNodesChange = useCallback<OnNodesChange<NodeWorkflowNode>>(
    (changes) => {
      setWorkflowStorage((currentStorage) =>
        patchCurrentProjectState(
          currentStorage,
          defaultProjectName,
          (currentState) => ({
            ...currentState,
            nodes: applyNodeChanges(changes, currentState.nodes),
          }),
        ),
      )
    },
    [defaultProjectName, setWorkflowStorage],
  )

  const onEdgesChange = useCallback<OnEdgesChange<NodeWorkflowEdge>>(
    (changes) => {
      setWorkflowStorage((currentStorage) =>
        patchCurrentProjectState(
          currentStorage,
          defaultProjectName,
          (currentState) => ({
            ...currentState,
            edges: applyEdgeChanges(changes, currentState.edges),
          }),
        ),
      )
    },
    [defaultProjectName, setWorkflowStorage],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      const edgeId = createWorkflowId(NODE_STUDIO_ID_PREFIXES.edge)
      setWorkflowStorage((currentStorage) =>
        patchCurrentProjectState(
          currentStorage,
          defaultProjectName,
          (currentState) => ({
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
          }),
        ),
      )
    },
    [defaultProjectName, setWorkflowStorage],
  )

  return useMemo(
    () => ({
      state,
      nodes: state.nodes,
      edges: state.edges,
      projects,
      currentProjectId: currentProject.id,
      currentProjectName: currentProject.name,
      addNode,
      createProject,
      switchProject,
      renameCurrentProject,
      deleteProject,
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
      createProject,
      currentProject.id,
      currentProject.name,
      deleteNode,
      deleteProject,
      getOutgoingTargetByType,
      onConnect,
      onEdgesChange,
      onNodesChange,
      projects,
      renameCurrentProject,
      state,
      spawnCharactersFromBreakdown,
      switchProject,
      updateScriptBreakdown,
      updateNodeData,
    ],
  )
}
