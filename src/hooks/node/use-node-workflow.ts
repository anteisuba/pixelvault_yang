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
  getNodeStudioWorkflowStorageKey,
  NODE_STUDIO_AGENT_MODE_IDS,
  NODE_STUDIO_EDGE_VISUALS,
  NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS,
  NODE_STUDIO_ID_PREFIXES,
  NODE_STUDIO_NODE_PLACEMENT,
  NODE_STUDIO_PROJECTS,
  NODE_STUDIO_VOICE_PROFILE,
  NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS,
  NODE_STUDIO_WORKFLOW_STORAGE,
} from '@/constants/node-studio'
import {
  NODE_GENERATION_STATUS_IDS,
  NODE_MEDIA_KIND_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
  NODE_WORKFLOW_FIELD_IDS,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import {
  NodeWorkflowLegacyV2StorageSchema,
  NodeWorkflowStateSchema,
  NodeWorkflowStorageSchema,
  type NodeWorkflowEdge,
  type NodeWorkflowNode,
  type NodeWorkflowNodeData,
  type NodeWorkflowProject,
  type NodeWorkflowProjectRecord,
  type NodeWorkflowProjectSummary,
  type NodeWorkflowState,
  type NodeWorkflowStorageSnapshot,
} from '@/types/node-workflow'
import {
  createNodeWorkflowProjectAPI,
  deleteNodeWorkflowProjectAPI,
  listNodeWorkflowProjectsAPI,
  updateNodeWorkflowProjectAPI,
  activateNodeWorkflowProjectAPI,
} from '@/lib/api-client'
import { applyDagreLayout } from '@/lib/node-workflow-layout'
import type {
  ScriptBreakdownPlanner,
  ScriptBreakdownResult,
} from '@/types/script-breakdown'
import type {
  SeedancePromptPlanPlanner,
  SeedancePromptPlanResult,
} from '@/types/seedance-prompt-plan'

export const EMPTY_NODE_WORKFLOW_STATE: NodeWorkflowState = {
  nodes: [],
  edges: [],
}

export interface UseNodeWorkflowOptions {
  defaultProjectName: string
  /**
   * Clerk user id of the currently signed-in user. Passing `null` (e.g.
   * before Clerk finishes loading, or while signed out) puts the hook into
   * a "parked" state: it serves an empty default project but skips all
   * localStorage reads/writes and all server API calls. The moment a real
   * clerkId arrives, the hook hydrates from that user's scoped slot. This
   * is what stops a previous account's workflow data from leaking into a
   * different sign-in on the same browser.
   */
  clerkId: string | null
}

export interface NodeWorkflowActions {
  updateNodeData(id: string, patch: Partial<NodeWorkflowNodeData>): void
  updateScriptBreakdown(
    nodeId: string,
    breakdown: ScriptBreakdownResult,
    planner: ScriptBreakdownPlanner,
  ): void
  updateSeedancePromptPlan(
    nodeId: string,
    plan: SeedancePromptPlanResult,
    planner: SeedancePromptPlanPlanner,
  ): void
  spawnCharactersFromBreakdown(agentNodeId: string): SpawnCharactersResult
  spawnFullWorkflowFromAgent(agentNodeId: string): SpawnFullWorkflowResult
  applySeedancePromptPlanToSeedance(
    agentNodeId: string,
  ): ApplySeedancePromptPlanResult
  deleteNode(id: string): void
}

export interface SpawnCharactersResult {
  createdNodeIds: string[]
  skippedCharacterIds: string[]
}

export interface SpawnFullWorkflowResult {
  createdNodeIds: string[]
  shotCount: number
  refusal: 'noBreakdown' | 'notAgent' | 'emptyShots' | null
}

export interface ApplySeedancePromptPlanResult {
  appliedNodeId: string | null
  reason?: 'missingAgent' | 'missingPlan' | 'missingSeedanceTarget'
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
  /**
   * Re-flow nodes via dagre. Pure layout — does not touch node data, edges,
   * or any project metadata, just rewrites positions.
   */
  tidyLayout(): void
  /**
   * Force the current project's state to the server right now, bypassing
   * the 5-second debounce. Resolves true on success, false otherwise so
   * the UI can toast the right message. Safe to call before the server
   * hydrate completes — it will no-op and return false.
   */
  saveNow(): Promise<boolean>
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
  ownerClerkId: string,
): NodeWorkflowStorageSnapshot {
  return {
    version: NODE_STUDIO_WORKFLOW_STORAGE.version,
    ownerClerkId,
    currentProjectId: project.id,
    projects: [project],
  }
}

/**
 * Sentinel owner id used by the "parked" snapshot served before Clerk
 * resolves the real user. Writers must never persist a snapshot carrying
 * this id — the write helpers refuse to touch localStorage / the server
 * until a real clerkId is available.
 */
const PARKED_OWNER_CLERK_ID = '__parked__'

function createDefaultWorkflowStorage(
  defaultProjectName: string,
  ownerClerkId: string,
): NodeWorkflowStorageSnapshot {
  const normalizedName = normalizeProjectName(
    defaultProjectName,
    defaultProjectName,
  )

  return createWorkflowStorageFromProject(
    createWorkflowProject(normalizedName, createEmptyWorkflowState()),
    ownerClerkId,
  )
}

function createWorkflowStorageFromLegacyState(
  defaultProjectName: string,
  state: NodeWorkflowState,
  ownerClerkId: string,
): NodeWorkflowStorageSnapshot {
  const normalizedName = normalizeProjectName(
    defaultProjectName,
    defaultProjectName,
  )

  return createWorkflowStorageFromProject(
    createWorkflowProject(normalizedName, state),
    ownerClerkId,
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

  return createWorkflowStorageFromProject(
    replacementProject,
    storage.ownerClerkId,
  )
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

  if (type === NODE_TYPE_IDS.agent) {
    return {
      prompt: '',
      agentMode: NODE_STUDIO_AGENT_MODE_IDS.storyBreakdown,
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

  if (
    type === NODE_TYPE_IDS.shot ||
    type === NODE_TYPE_IDS.backgroundImage ||
    type === NODE_TYPE_IDS.frameImage
  ) {
    return {
      prompt: '',
      status: NODE_STATUS_IDS.idle,
      generationStatus: NODE_GENERATION_STATUS_IDS.idle,
      imageMode: NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.choice,
      mediaKind: NODE_MEDIA_KIND_IDS.image,
      referenceAssets: [],
      loras: [],
      [NODE_WORKFLOW_FIELD_IDS.action]: '',
      [NODE_WORKFLOW_FIELD_IDS.camera]: '',
      [NODE_WORKFLOW_FIELD_IDS.composition]: '',
      [NODE_WORKFLOW_FIELD_IDS.frameIntent]: '',
      [NODE_WORKFLOW_FIELD_IDS.lighting]: '',
      [NODE_WORKFLOW_FIELD_IDS.location]: '',
      [NODE_WORKFLOW_FIELD_IDS.mood]: '',
    }
  }

  if (type === NODE_TYPE_IDS.seedance) {
    return {
      prompt: '',
      status: NODE_STATUS_IDS.idle,
      generationStatus: NODE_GENERATION_STATUS_IDS.idle,
      mediaKind: NODE_MEDIA_KIND_IDS.video,
      [NODE_WORKFLOW_FIELD_IDS.audioIntent]: '',
      [NODE_WORKFLOW_FIELD_IDS.camera]: '',
      [NODE_WORKFLOW_FIELD_IDS.duration]: '',
      [NODE_WORKFLOW_FIELD_IDS.motion]: '',
    }
  }

  if (type === NODE_TYPE_IDS.voice) {
    return {
      prompt: '',
      status: NODE_STATUS_IDS.idle,
      generationStatus: NODE_GENERATION_STATUS_IDS.idle,
      mediaKind: NODE_MEDIA_KIND_IDS.audio,
      voiceSource: NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.manual,
      [NODE_WORKFLOW_FIELD_IDS.voiceId]: '',
      [NODE_WORKFLOW_FIELD_IDS.voiceName]: '',
      [NODE_WORKFLOW_FIELD_IDS.voiceProvider]:
        NODE_STUDIO_VOICE_PROFILE.providerDefault,
      [NODE_WORKFLOW_FIELD_IDS.voiceEmotion]: '',
      [NODE_WORKFLOW_FIELD_IDS.voiceStyle]: '',
    }
  }

  if (type === NODE_TYPE_IDS.videoReference) {
    return {
      prompt: '',
      status: NODE_STATUS_IDS.idle,
      mediaKind: NODE_MEDIA_KIND_IDS.video,
    }
  }

  if (type === NODE_TYPE_IDS.videoMerge) {
    return {
      prompt: '',
      status: NODE_STATUS_IDS.idle,
      generationStatus: NODE_GENERATION_STATUS_IDS.idle,
      mediaKind: NODE_MEDIA_KIND_IDS.video,
    }
  }

  if (type === NODE_TYPE_IDS.shotText) {
    return {
      prompt: '',
      status: NODE_STATUS_IDS.idle,
      mediaKind: NODE_MEDIA_KIND_IDS.text,
      [NODE_WORKFLOW_FIELD_IDS.action]: '',
      [NODE_WORKFLOW_FIELD_IDS.camera]: '',
      [NODE_WORKFLOW_FIELD_IDS.composition]: '',
      [NODE_WORKFLOW_FIELD_IDS.scene]: '',
    }
  }

  return {
    prompt: '',
    status: NODE_STATUS_IDS.idle,
  }
}

function readWorkflowStorageFromStorage(
  defaultProjectName: string,
  clerkId: string,
): NodeWorkflowStorageSnapshot {
  if (typeof window === 'undefined') {
    return createDefaultWorkflowStorage(defaultProjectName, clerkId)
  }

  try {
    const raw = window.localStorage.getItem(
      getNodeStudioWorkflowStorageKey(clerkId),
    )
    if (!raw) {
      return createDefaultWorkflowStorage(defaultProjectName, clerkId)
    }

    const parsedJson = JSON.parse(raw) as unknown
    const parsedStorage = NodeWorkflowStorageSchema.safeParse(parsedJson)
    if (parsedStorage.success) {
      // Belt-and-suspenders: the per-user storage key already isolates
      // slots, but if a snapshot somehow lands in the wrong key (e.g.
      // browser sync, manual import, dev tools tinkering) we still
      // refuse to hydrate it. The empty default forces a fresh start
      // for this account rather than rendering another account's work.
      if (parsedStorage.data.ownerClerkId !== clerkId) {
        return createDefaultWorkflowStorage(defaultProjectName, clerkId)
      }
      return parsedStorage.data
    }

    // v2 snapshots (no ownerClerkId) are accepted only because they live
    // in the per-user key — there's no cross-account ambiguity. Stamp
    // the current clerkId on so subsequent writes use the v3 contract.
    const parsedLegacyV2Storage =
      NodeWorkflowLegacyV2StorageSchema.safeParse(parsedJson)
    if (parsedLegacyV2Storage.success) {
      return {
        version: NODE_STUDIO_WORKFLOW_STORAGE.version,
        ownerClerkId: clerkId,
        currentProjectId: parsedLegacyV2Storage.data.currentProjectId,
        projects: parsedLegacyV2Storage.data.projects,
      }
    }

    const parsedLegacyState = NodeWorkflowStateSchema.safeParse(parsedJson)
    if (parsedLegacyState.success) {
      return createWorkflowStorageFromLegacyState(
        defaultProjectName,
        {
          nodes: parsedLegacyState.data.nodes,
          edges: parsedLegacyState.data.edges,
        },
        clerkId,
      )
    }

    return createDefaultWorkflowStorage(defaultProjectName, clerkId)
  } catch {
    return createDefaultWorkflowStorage(defaultProjectName, clerkId)
  }
}

/**
 * 5s of inactivity before pushing the current project state to the server.
 * Long enough that rapid edits collapse into a single PUT; short enough
 * that a crash or tab close loses at most a few seconds of work.
 */
const SERVER_WRITE_DEBOUNCE_MS = 5000

function projectFromServerRecord(
  record: NodeWorkflowProjectRecord,
): NodeWorkflowProject {
  return {
    id: record.id,
    name: record.name,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    state: record.state,
  }
}

function writeWorkflowStorageToStorage(
  storage: NodeWorkflowStorageSnapshot,
  clerkId: string,
): void {
  if (typeof window === 'undefined') {
    return
  }

  // Refuse to persist a snapshot whose owner doesn't match the active
  // session — that means we're mid-account-switch and the in-memory
  // state is still the previous user's. Better to drop the write than
  // to stamp another account's data into this user's slot.
  if (storage.ownerClerkId !== clerkId) {
    return
  }

  try {
    window.localStorage.setItem(
      getNodeStudioWorkflowStorageKey(clerkId),
      JSON.stringify(storage),
    )
  } catch {
    return
  }
}

/**
 * One-shot cleanup of the pre-v3 global key. v2 and earlier stored every
 * account's workflows under the same un-scoped localStorage slot, so
 * leaving the legacy row in place would keep leaking data into the v3
 * read path if any downstream code ever falls back to it. Run on hook
 * mount, swallow errors — this is purely best-effort.
 */
function purgeLegacyGlobalStorage(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(NODE_STUDIO_WORKFLOW_STORAGE.legacyGlobalKey)
  } catch {
    // ignore
  }
}

export function useNodeWorkflow({
  defaultProjectName,
  clerkId,
}: UseNodeWorkflowOptions): UseNodeWorkflowValue {
  const parkedStorage = useMemo(
    () =>
      createDefaultWorkflowStorage(defaultProjectName, PARKED_OWNER_CLERK_ID),
    [defaultProjectName],
  )
  const [storageState, setStorageState] =
    useState<NodeWorkflowStorageSnapshot>(parkedStorage)
  const storageRef = useRef<NodeWorkflowStorageSnapshot>(parkedStorage)
  // Tracks whether we've finished the localStorage hydrate for the
  // *currently active* clerkId. Cleared whenever clerkId changes so an
  // account switch reruns the whole hydrate pipeline instead of leaving
  // the previous user's snapshot on screen.
  const hasHydrated = useRef(false)
  const hasPreHydrationMutation = useRef(false)
  // Which clerkId the in-memory snapshot belongs to. Distinct from
  // `clerkId` (the prop), which is what Clerk says is current. They
  // disagree briefly during account switches — we use `loadedForClerkId`
  // to gate writes so we don't write user A's data into user B's slot.
  const loadedForClerkId = useRef<string | null>(null)
  // ── Server hydration (Phase 2 of 7g) ────────────────────────────────
  // Refs declared up here (instead of next to their effect) so the
  // clerkId-change effect below can reset them on account switch.
  const hasServerHydrated = useRef(false)
  const hasServerMigrationAttempted = useRef(false)

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

  // One-shot legacy wipe — runs once per browser session regardless of
  // who's signed in. Safe to call repeatedly; removeItem on a missing
  // key is a no-op.
  useEffect(() => {
    purgeLegacyGlobalStorage()
  }, [])

  // Hydrate from the per-user localStorage slot whenever clerkId
  // changes. When clerkId is null (parked / signed out), drop back to
  // the empty default and clear all hydration flags so a later sign-in
  // re-runs the full pipeline cleanly. All state writes happen in a
  // microtask so React batches a single re-render per clerkId change
  // instead of a cascading effect → setState → effect loop.
  useEffect(() => {
    // Synchronous ref resets are fine — they're not React state, so
    // they don't trigger renders. We always want subsequent effects in
    // the same tick to see the cleared values.
    hasHydrated.current = false
    hasPreHydrationMutation.current = false
    hasServerHydrated.current = false
    hasServerMigrationAttempted.current = false
    if (clerkId === null) {
      loadedForClerkId.current = null
    }

    let cancelled = false
    let preHydrationSaveTimeout: number | undefined

    window.queueMicrotask(() => {
      if (cancelled) {
        return
      }

      if (clerkId === null) {
        const reset = createDefaultWorkflowStorage(
          defaultProjectName,
          PARKED_OWNER_CLERK_ID,
        )
        storageRef.current = reset
        setStorageState(reset)
        return
      }

      hasHydrated.current = true
      loadedForClerkId.current = clerkId

      if (hasPreHydrationMutation.current) {
        preHydrationSaveTimeout = window.setTimeout(() => {
          writeWorkflowStorageToStorage(storageRef.current, clerkId)
        }, NODE_STUDIO_WORKFLOW_STORAGE.debounceMs)
        return
      }

      const hydratedStorage = readWorkflowStorageFromStorage(
        defaultProjectName,
        clerkId,
      )
      storageRef.current = hydratedStorage
      setStorageState(hydratedStorage)
    })

    return () => {
      cancelled = true
      if (preHydrationSaveTimeout !== undefined) {
        window.clearTimeout(preHydrationSaveTimeout)
      }
    }
  }, [clerkId, defaultProjectName])

  useEffect(() => {
    if (!hasHydrated.current) {
      return
    }
    if (clerkId === null) return
    if (loadedForClerkId.current !== clerkId) return

    const timeoutId = window.setTimeout(() => {
      writeWorkflowStorageToStorage(storageState, clerkId)
    }, NODE_STUDIO_WORKFLOW_STORAGE.debounceMs)

    return () => window.clearTimeout(timeoutId)
  }, [clerkId, storageState])

  // Server hydration: once localStorage has settled AND we know who's
  // signed in, pull the server-side project list. The server is the
  // source of truth — if it has projects, they replace local state. If
  // the server is empty but localStorage has data **belonging to this
  // user**, treat it as a one-time migration. Critically, we re-verify
  // `storageRef.current.ownerClerkId === clerkId` right before the
  // migration POSTs run — that's the seatbelt that stops a previous
  // account's leftover local state from being uploaded as the new
  // user's projects.
  useEffect(() => {
    if (clerkId === null) return
    if (hasServerHydrated.current) return
    if (!hasHydrated.current) return
    if (loadedForClerkId.current !== clerkId) return

    let cancelled = false
    void (async () => {
      const response = await listNodeWorkflowProjectsAPI()
      if (cancelled) return

      // Network or auth failure — silently fall back to localStorage so the
      // user keeps editing offline. We'll retry sync on the next state
      // change via the write effect below.
      if (!response.success || !response.data) {
        hasServerHydrated.current = true
        return
      }

      const serverProjects = response.data
      const localSnapshot = storageRef.current

      if (serverProjects.length > 0) {
        const nextStorage: NodeWorkflowStorageSnapshot = {
          version: NODE_STUDIO_WORKFLOW_STORAGE.version,
          ownerClerkId: clerkId,
          currentProjectId: serverProjects[0].id,
          projects: serverProjects.map(projectFromServerRecord),
        }
        storageRef.current = nextStorage
        setStorageState(nextStorage)
        hasServerHydrated.current = true
        return
      }

      // Server is empty. Migration is only safe when the local snapshot
      // is provably owned by the user currently signed in — otherwise
      // we'd be POSTing a previous account's projects into this account.
      if (localSnapshot.ownerClerkId !== clerkId) {
        hasServerHydrated.current = true
        return
      }

      // Empty local projects (just the bootstrap default) aren't worth
      // migrating.
      const localHasContent = localSnapshot.projects.some(
        (project) =>
          project.state.nodes.length > 0 || project.state.edges.length > 0,
      )
      if (localHasContent && !hasServerMigrationAttempted.current) {
        hasServerMigrationAttempted.current = true
        for (const project of localSnapshot.projects) {
          await createNodeWorkflowProjectAPI({
            name: project.name,
            state: project.state,
          })
        }
        // Re-fetch to pick up server-assigned ids, then re-run the hydrate
        // path so the canvas swaps to the migrated copy.
        const refetch = await listNodeWorkflowProjectsAPI()
        if (cancelled) return
        if (refetch.success && refetch.data && refetch.data.length > 0) {
          const nextStorage: NodeWorkflowStorageSnapshot = {
            version: NODE_STUDIO_WORKFLOW_STORAGE.version,
            ownerClerkId: clerkId,
            currentProjectId: refetch.data[0].id,
            projects: refetch.data.map(projectFromServerRecord),
          }
          storageRef.current = nextStorage
          setStorageState(nextStorage)
        }
      }

      hasServerHydrated.current = true
    })()

    return () => {
      cancelled = true
    }
    // Re-checked on every state tick so the "wait until localStorage
    // hydrated" gate eventually opens the server hydrate.
  }, [clerkId, storageState])

  // Debounced server write — pushes the CURRENT project's state up every
  // ~5s of inactivity. We don't push the full snapshot (other projects)
  // because Inspector edits only touch the current project; non-current
  // projects only change when the user explicitly switches/renames/deletes
  // them, and those operations go through their own server calls below.
  useEffect(() => {
    if (clerkId === null) return
    if (!hasServerHydrated.current) return
    if (storageState.ownerClerkId !== clerkId) return

    const currentId = storageState.currentProjectId
    const current = storageState.projects.find((p) => p.id === currentId)
    if (!current) return

    const timeoutId = window.setTimeout(() => {
      void updateNodeWorkflowProjectAPI(currentId, {
        state: current.state,
      })
    }, SERVER_WRITE_DEBOUNCE_MS)

    return () => window.clearTimeout(timeoutId)
  }, [clerkId, storageState])

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

  // Gate every server-side effect on (a) Clerk having loaded a user
  // and (b) the in-memory storage already belonging to that user.
  // The second condition is what stops mid-account-switch writes from
  // hitting the new user's row before hydrate finishes.
  const canCallServerNow = useCallback(() => {
    if (clerkId === null) return false
    if (!hasServerHydrated.current) return false
    if (storageRef.current.ownerClerkId !== clerkId) return false
    return true
  }, [clerkId])

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

      // Fire-and-forget create on the server. If it succeeds with a
      // different id (server assigns its own UUID), rewrite the local id so
      // subsequent writes / activate calls hit the right row. If it fails,
      // the project lives only in localStorage until the user reloads (at
      // which point the server hydrate will reconcile).
      if (canCallServerNow()) {
        void createNodeWorkflowProjectAPI({
          name: normalizedName,
          state: project.state,
        }).then((response) => {
          if (
            response.success &&
            response.data &&
            response.data.id !== project.id
          ) {
            const serverId = response.data.id
            setWorkflowStorage((currentStorage) => ({
              ...currentStorage,
              currentProjectId:
                currentStorage.currentProjectId === project.id
                  ? serverId
                  : currentStorage.currentProjectId,
              projects: currentStorage.projects.map((p) =>
                p.id === project.id ? { ...p, id: serverId } : p,
              ),
            }))
          }
        })
      }

      return project.id
    },
    [canCallServerNow, defaultProjectName, setWorkflowStorage],
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

      // Bump server lastActiveAt so reopening this account on another
      // device lands on the just-switched-to project.
      if (canCallServerNow()) {
        void activateNodeWorkflowProjectAPI(id)
      }
    },
    [canCallServerNow, setWorkflowStorage],
  )

  const renameCurrentProject = useCallback(
    (name: string) => {
      let renamedId: string | null = null
      let renamedName: string | null = null
      setWorkflowStorage((currentStorage) => {
        const current = getCurrentProject(currentStorage, defaultProjectName)
        const normalizedName = normalizeProjectName(name, current.name)
        const updatedAt = createWorkflowTimestamp()
        renamedId = current.id
        renamedName = normalizedName

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

      if (canCallServerNow() && renamedId && renamedName) {
        void updateNodeWorkflowProjectAPI(renamedId, { name: renamedName })
      }
    },
    [canCallServerNow, defaultProjectName, setWorkflowStorage],
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
          return createDefaultWorkflowStorage(
            defaultProjectName,
            currentStorage.ownerClerkId,
          )
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

      if (canCallServerNow()) {
        void deleteNodeWorkflowProjectAPI(id)
      }

      return getProjectSummaries([targetProject])[0] ?? null
    },
    [canCallServerNow, defaultProjectName, setWorkflowStorage],
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
                      seedancePromptPlan: undefined,
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

  const updateSeedancePromptPlan = useCallback(
    (
      nodeId: string,
      plan: SeedancePromptPlanResult,
      planner: SeedancePromptPlanPlanner,
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
                      breakdown: undefined,
                      agentMode: NODE_STUDIO_AGENT_MODE_IDS.seedancePrompt,
                      seedancePromptPlan: plan,
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

  /**
   * Materialise the Agent's curated shot list into a runnable subgraph:
   *   - one shotText node per shot, prefilled with action + camera
   *   - one Seedance node per shot, duration derived from start/endSec
   *   - per-shot edges: shotText → seedance, plus each bound character /
   *     background node → seedance (skipped silently when the user
   *     hasn't spawned the matching node yet)
   *   - a single videoMerge node fed by every Seedance when ≥2 shots
   *
   * Bindings reference breakdown character / scene IDs and are translated
   * via the maps below to actual on-canvas node ids. The function does
   * NOT spawn characters — pair with spawnCharactersFromBreakdown for
   * the full chain.
   *
   * Works in both storyBreakdown (uses breakdown.shots) and
   * seedancePrompt (uses seedancePromptPlan.timeline) modes — the agent
   * mode field decides which list drives the spawn.
   */
  const spawnFullWorkflowFromAgent = useCallback(
    (agentNodeId: string): SpawnFullWorkflowResult => {
      const currentState = getCurrentProject(
        storageRef.current,
        defaultProjectName,
      ).state
      const agentNode = currentState.nodes.find(
        (node) => node.id === agentNodeId && node.type === NODE_TYPE_IDS.agent,
      )
      if (!agentNode) {
        return { createdNodeIds: [], shotCount: 0, refusal: 'notAgent' }
      }

      const breakdown = agentNode.data.breakdown
      const plan = agentNode.data.seedancePromptPlan
      const usingBreakdown =
        agentNode.data.agentMode === NODE_STUDIO_AGENT_MODE_IDS.storyBreakdown
          ? Boolean(breakdown)
          : false
      const usingPlan = !usingBreakdown && Boolean(plan)
      if (!usingBreakdown && !usingPlan) {
        return { createdNodeIds: [], shotCount: 0, refusal: 'noBreakdown' }
      }

      interface ShotInput {
        action: string
        camera: string
        startSecond?: number
        endSecond?: number
        characterIds?: string[]
        backgroundIds?: string[]
        maxReferences?: number
      }
      const shots: ShotInput[] = usingBreakdown
        ? (breakdown?.shots ?? []).map((shot) => ({
            action: shot.promptSeed,
            camera: shot.camera,
            startSecond: shot.startSecond,
            endSecond: shot.endSecond,
            characterIds: shot.characterIds,
            backgroundIds: shot.backgroundIds,
            maxReferences: shot.maxReferences,
          }))
        : (plan?.timeline ?? []).map((item) => ({
            action: item.action,
            camera: item.camera,
            startSecond: item.startSecond,
            endSecond: item.endSecond,
            characterIds: item.characterIds,
            backgroundIds: item.backgroundIds,
            maxReferences: item.maxReferences,
          }))

      if (shots.length === 0) {
        return { createdNodeIds: [], shotCount: 0, refusal: 'emptyShots' }
      }

      // characterDraftId -> on-canvas characterImage node id. Only nodes
      // already spawned are included — missing characters quietly drop
      // out of the binding map and the user can rerun spawnCharacters
      // then this action again to fill them in.
      const characterDraftToNodeId = new Map<string, string>()
      for (const node of currentState.nodes) {
        if (node.type !== NODE_TYPE_IDS.characterImage) continue
        const draftId = node.data.character?.characterId
        if (typeof draftId === 'string' && draftId.length > 0) {
          characterDraftToNodeId.set(draftId, node.id)
        }
      }
      // backgroundDraftId (scene id) -> on-canvas backgroundImage node.
      // backgroundImage nodes don't ship with a draft-id field yet, so
      // for now the map is best-effort: nodes whose data carries a
      // `sceneId` property will be linked, others silently skipped.
      const backgroundDraftToNodeId = new Map<string, string>()
      for (const node of currentState.nodes) {
        if (node.type !== NODE_TYPE_IDS.backgroundImage) continue
        const sceneId =
          'sceneId' in node.data && typeof node.data.sceneId === 'string'
            ? node.data.sceneId
            : undefined
        if (sceneId) backgroundDraftToNodeId.set(sceneId, node.id)
      }

      const {
        shotTextOffsetX,
        seedanceOffsetX,
        videoMergeOffsetX,
        rowOffsetY,
      } = NODE_STUDIO_NODE_PLACEMENT.workflowSpawn
      const firstY =
        agentNode.position.y - ((shots.length - 1) * rowOffsetY) / 2

      const createdNodes: NodeWorkflowNode[] = []
      const createdEdges: NodeWorkflowEdge[] = []
      const seedanceNodeIds: string[] = []

      const pushEdge = (sourceId: string, targetId: string) => {
        createdEdges.push({
          id: createWorkflowId(NODE_STUDIO_ID_PREFIXES.edge),
          source: sourceId,
          target: targetId,
          type: NODE_STUDIO_EDGE_VISUALS.type,
          interactionWidth: NODE_STUDIO_EDGE_VISUALS.interactionWidth,
          markerEnd: {
            type: NODE_STUDIO_EDGE_VISUALS.markerEndType,
            color: NODE_STUDIO_EDGE_VISUALS.color,
            width: NODE_STUDIO_EDGE_VISUALS.markerSize,
            height: NODE_STUDIO_EDGE_VISUALS.markerSize,
            strokeWidth: NODE_STUDIO_EDGE_VISUALS.markerStrokeWidth,
          },
        })
      }

      shots.forEach((shot, index) => {
        const rowY = firstY + index * rowOffsetY

        const shotTextNodeId = createWorkflowId(NODE_STUDIO_ID_PREFIXES.node)
        createdNodes.push({
          id: shotTextNodeId,
          type: NODE_TYPE_IDS.shotText,
          position: {
            x: agentNode.position.x + shotTextOffsetX,
            y: rowY,
          },
          data: {
            prompt: '',
            status: NODE_STATUS_IDS.idle,
            action: shot.action.trim() || undefined,
            camera: shot.camera.trim() || undefined,
          },
        })

        const seedanceNodeId = createWorkflowId(NODE_STUDIO_ID_PREFIXES.node)
        const durationSec =
          typeof shot.startSecond === 'number' &&
          typeof shot.endSecond === 'number'
            ? Math.max(0.1, shot.endSecond - shot.startSecond)
            : undefined
        createdNodes.push({
          id: seedanceNodeId,
          type: NODE_TYPE_IDS.seedance,
          position: {
            x: agentNode.position.x + seedanceOffsetX,
            y: rowY,
          },
          data: {
            prompt: '',
            status: NODE_STATUS_IDS.idle,
            generationStatus: NODE_GENERATION_STATUS_IDS.idle,
            // duration is stored as a string on the node (text-input
            // legacy); the workbench parses it back to a number for the
            // generate call.
            ...(typeof durationSec === 'number'
              ? { duration: String(Math.round(durationSec)) }
              : {}),
          },
        })
        seedanceNodeIds.push(seedanceNodeId)

        pushEdge(shotTextNodeId, seedanceNodeId)

        for (const characterDraftId of shot.characterIds ?? []) {
          const target = characterDraftToNodeId.get(characterDraftId)
          if (target) pushEdge(target, seedanceNodeId)
        }
        for (const backgroundDraftId of shot.backgroundIds ?? []) {
          const target = backgroundDraftToNodeId.get(backgroundDraftId)
          if (target) pushEdge(target, seedanceNodeId)
        }
      })

      // videoMerge: only meaningful with 2+ clips.
      if (seedanceNodeIds.length >= 2) {
        const mergeNodeId = createWorkflowId(NODE_STUDIO_ID_PREFIXES.node)
        createdNodes.push({
          id: mergeNodeId,
          type: NODE_TYPE_IDS.videoMerge,
          position: {
            x: agentNode.position.x + videoMergeOffsetX,
            y: agentNode.position.y,
          },
          data: {
            prompt: '',
            status: NODE_STATUS_IDS.idle,
            generationStatus: NODE_GENERATION_STATUS_IDS.idle,
          },
        })
        for (const seedanceId of seedanceNodeIds) {
          pushEdge(seedanceId, mergeNodeId)
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
        shotCount: shots.length,
        refusal: null,
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

  const applySeedancePromptPlanToSeedance = useCallback(
    (agentNodeId: string): ApplySeedancePromptPlanResult => {
      const currentState = getCurrentProject(
        storageRef.current,
        defaultProjectName,
      ).state
      const agentNode = currentState.nodes.find(
        (node) => node.id === agentNodeId && node.type === NODE_TYPE_IDS.agent,
      )

      if (!agentNode) {
        return { appliedNodeId: null, reason: 'missingAgent' }
      }

      const plan = agentNode.data.seedancePromptPlan
      if (!plan) {
        return { appliedNodeId: null, reason: 'missingPlan' }
      }

      const targetSeedanceNode = currentState.edges
        .filter((edge) => edge.source === agentNodeId)
        .map((edge) =>
          currentState.nodes.find(
            (node) =>
              node.id === edge.target && node.type === NODE_TYPE_IDS.seedance,
          ),
        )
        .find((node): node is NodeWorkflowNode => Boolean(node))

      if (!targetSeedanceNode) {
        return { appliedNodeId: null, reason: 'missingSeedanceTarget' }
      }

      setWorkflowStorage((currentStorage) =>
        patchCurrentProjectState(
          currentStorage,
          defaultProjectName,
          (latestState) => ({
            ...latestState,
            nodes: latestState.nodes.map((node) =>
              node.id === targetSeedanceNode.id
                ? {
                    ...node,
                    data: {
                      ...node.data,
                      [NODE_WORKFLOW_FIELD_IDS.motion]: plan.motion,
                      [NODE_WORKFLOW_FIELD_IDS.camera]: plan.camera,
                      [NODE_WORKFLOW_FIELD_IDS.duration]: plan.duration,
                      [NODE_WORKFLOW_FIELD_IDS.audioIntent]: plan.audioIntent,
                      prompt: plan.finalPrompt,
                      generationError: undefined,
                      status: NODE_STATUS_IDS.ready,
                    },
                  }
                : node,
            ),
          }),
        ),
      )

      return { appliedNodeId: targetSeedanceNode.id }
    },
    [defaultProjectName, setWorkflowStorage],
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

  const saveNow = useCallback(async (): Promise<boolean> => {
    if (!canCallServerNow()) return false
    const snapshot = storageRef.current
    const currentId = snapshot.currentProjectId
    const current = snapshot.projects.find((p) => p.id === currentId)
    if (!current) return false
    const response = await updateNodeWorkflowProjectAPI(currentId, {
      state: current.state,
    })
    return response.success
  }, [canCallServerNow])

  const tidyLayout = useCallback(() => {
    setWorkflowStorage((currentStorage) =>
      patchCurrentProjectState(
        currentStorage,
        defaultProjectName,
        (currentState) => ({
          ...currentState,
          nodes: applyDagreLayout(currentState.nodes, currentState.edges),
        }),
      ),
    )
  }, [defaultProjectName, setWorkflowStorage])

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
      updateSeedancePromptPlan,
      spawnCharactersFromBreakdown,
      spawnFullWorkflowFromAgent,
      applySeedancePromptPlanToSeedance,
      deleteNode,
      getOutgoingTargetByType,
      onNodesChange,
      onEdgesChange,
      onConnect,
      tidyLayout,
      saveNow,
    }),
    [
      addNode,
      applySeedancePromptPlanToSeedance,
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
      saveNow,
      state,
      spawnCharactersFromBreakdown,
      spawnFullWorkflowFromAgent,
      switchProject,
      tidyLayout,
      updateScriptBreakdown,
      updateSeedancePromptPlan,
      updateNodeData,
    ],
  )
}
