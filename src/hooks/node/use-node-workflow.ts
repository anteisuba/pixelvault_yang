'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
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
  NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS,
  NODE_STUDIO_LOOSE_IMAGE_DEFAULT_SIZE,
  NODE_STUDIO_NODE_PLACEMENT,
  NODE_STUDIO_PROJECTS,
  NODE_STUDIO_VOICE_PROFILE,
  NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS,
  NODE_STUDIO_WORKFLOW_STORAGE,
} from '@/constants/node-studio'
import {
  NODE_GENERATION_STATUS_IDS,
  NODE_MEDIA_KIND_BY_NODE_TYPE,
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
  type CanvasAppearance,
  type NodeWorkflowEdge,
  type NodeWorkflowEdgeData,
  type NodeWorkflowNode,
  type NodeWorkflowNodeData,
  type NodeWorkflowProject,
  type NodeWorkflowProjectRecord,
  type NodeWorkflowProjectSummary,
  type NodeWorkflowState,
  type NodeWorkflowStorageSnapshot,
} from '@/types/node-workflow'
import {
  CanvasDerivedImageOutputsSchema,
  type CanvasDerivedImageOutput,
} from '@/types/canvas-image-edit'
import {
  createNodeWorkflowProjectAPI,
  deleteNodeWorkflowProjectAPI,
  listNodeWorkflowProjectsAPI,
  updateNodeWorkflowProjectAPI,
  activateNodeWorkflowProjectAPI,
} from '@/lib/api-client'
import { logger } from '@/lib/logger'
import { applyDagreLayout } from '@/lib/node-workflow-layout'
import { migrateRetireFusedNodes } from '@/lib/node-workflow-migrate-fused-nodes'
import { migrateRetirePlanner } from '@/lib/node-workflow-migrate-planner'
import { migrateImageRoles } from '@/lib/node-workflow-migrate-image-roles'
import { migrateVoiceClip } from '@/lib/node-workflow-migrate-voice-clip'
import {
  projectScriptDocToGraph,
  syncShotTextPatchToScriptDoc,
} from '@/lib/node-workflow-script-doc'
import type { ScriptDocDepth, ScriptDocStage } from '@/constants/script-doc'
import type { ScriptDoc } from '@/types/script-doc'

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
  /**
   * R3-6b §3 每镜覆写: patch an edge's `data` (currently only
   * `stageOverrideUrls` — see `NodeWorkflowEdgeDataSchema`). Mirrors
   * `updateNodeData`'s shallow-merge-and-persist shape; a no-op on an id that
   * doesn't exist. Setting `stageOverrideUrls: undefined` clears the override
   * back to the card's own onStage curation (the panel's "恢复默认" action).
   * Optional so the many existing `NodeWorkflowCanvasActions`-typed test
   * mocks (CharacterImageInspector.test / NodeMediaInspector.test) don't need
   * updating for a capability only the video composer's 管理素材 panel uses.
   */
  updateEdgeData?(id: string, patch: Partial<NodeWorkflowEdgeData>): void
  /**
   * Atomically place one or more non-destructive image edit results. Optional
   * on the shared canvas context until the UI wiring slice adopts the action;
   * the concrete useNodeWorkflow return always provides it.
   */
  placeDerivedImages?(
    sourceNodeId: string,
    outputs: readonly CanvasDerivedImageOutput[],
  ): string[]
  /** Persist the assistant's ScriptDoc fact model on the current project. */
  setScriptDoc(scriptDoc: ScriptDoc | undefined): void
  /** Persist or reset the current project's canvas wallpaper. */
  setCanvasAppearance(value: CanvasAppearance | undefined): void
  /** Persist the right-rail drafting stage / depth / manual-edit locks. */
  setScriptDocStage(value: ScriptDocStage): void
  setScriptDocDepth(value: ScriptDocDepth): void
  setScriptDocLocks(value: string[]): void
  /** 分镜静帧开关 (包 3): whether projecting spawns a still per shot. */
  setScriptDocShotStills(value: boolean): void
  /** Project the current ScriptDoc into character/voice/shot/merge nodes. */
  applyScriptDocToGraph(): ApplyScriptDocResult
  /** B4：同一套计算但不提交 —— 让「确认镜头」之前能看见将建/将更新/**将移除**。 */
  previewScriptDocProjection(): ApplyScriptDocResult
  deleteNode(id: string): void
  deleteEdge(id: string): void
  undo(): void
  redo(): void
  canUndo: boolean
  canRedo: boolean
}

export interface ApplyScriptDocResult {
  /** New nodes spawned this projection. */
  created: number
  /** Existing nodes whose ScriptDoc-owned fields changed. */
  updated: number
  /** Entities that already had a node (idempotent reuse). */
  skipped: number
  /** Nodes removed because their role/shot/line was deleted from the outline. */
  removed: number
  /** ScriptDoc-managed edges removed because the outline changed. */
  removedEdges: number
  refusal: 'noScriptDoc' | 'emptyScriptDoc' | null
}

interface UseNodeWorkflowValue extends NodeWorkflowActions {
  /**
   * B2.5：把一整批写入合并成一个撤销步。见实现处的注释。
   *
   * ⚠ **有意只放在这里，不放进 `NodeWorkflowActions`** —— 那个接口是发给节点卡片
   * 的动作集，卡片不该拿到撤销栈的记账开关。批次的拥有者是 workbench，它直接持有
   * hook 的返回值。
   */
  runAsSingleHistoryStep<T>(run: () => T | Promise<T>): Promise<T>
  /** True only after both local and server hydration finish for this user. */
  isHydrated: boolean
  state: NodeWorkflowState
  scriptDoc: ScriptDoc | undefined
  canvasAppearance: CanvasAppearance | undefined
  scriptDocStage: ScriptDocStage | undefined
  scriptDocDepth: ScriptDocDepth | undefined
  scriptDocLocks: string[] | undefined
  /** `undefined` = 默认开 (see NodeWorkflowStateDataSchema). */
  scriptDocShotStills: boolean | undefined
  nodes: NodeWorkflowNode[]
  edges: NodeWorkflowEdge[]
  projects: NodeWorkflowProjectSummary[]
  currentProjectId: string
  currentProjectName: string
  addNode(type: NodeWorkflowNodeType, position: XYPosition): string
  placeDerivedImages(
    sourceNodeId: string,
    outputs: readonly CanvasDerivedImageOutput[],
  ): string[]
  updateEdgeData(id: string, patch: Partial<NodeWorkflowEdgeData>): void
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

export function createDefaultNodeData(
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
 *
 * Exported so the write-gate tests can drive the exact debounce window
 * instead of hardcoding a second copy of the number.
 */
export const SERVER_WRITE_DEBOUNCE_MS = 5000

/**
 * Which server call failed. Only ever a log field, but named here so the
 * fire-and-forget call sites can't drift into free-form strings — and so a
 * log search for one of them finds every site that can emit it.
 */
export const SERVER_WRITE_OPERATIONS = {
  create: 'create-project',
  update: 'update-project-state',
  rename: 'rename-project',
  delete: 'delete-project',
  /** The one-time "local projects → server rows" upload on first hydrate. */
  migrate: 'migrate-local-projects',
  /**
   * `lastActiveAt` bump on project switch. Deliberately in its own bucket:
   * it is the only one of these whose failure costs the user *nothing but a
   * pointer* — see `switchProject`.
   */
  activate: 'activate-project',
} as const

type ServerWriteOperation =
  (typeof SERVER_WRITE_OPERATIONS)[keyof typeof SERVER_WRITE_OPERATIONS]

function projectFromServerRecord(
  record: NodeWorkflowProjectRecord,
): NodeWorkflowProject {
  return {
    id: record.id,
    name: record.name,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    // Hydration migrations are idempotent. The migrated state is held in
    // memory and persisted back on the next normal write.
    state: migrateWorkflowState(record.state),
  }
}

/**
 * One composition point for every post-parse workflow migration. Legacy
 * schemas remain parseable so old projects are never rejected as empty; this
 * function then converts their data to the current runtime model.
 */
function migrateWorkflowState(state: NodeWorkflowState): NodeWorkflowState {
  return migrateVoiceClip(
    migrateRetireFusedNodes(migrateImageRoles(migrateRetirePlanner(state))),
  )
}

/**
 * Apply hydration migrations to every project in a storage snapshot.
 * Preserves the snapshot/project reference when nothing changed so an
 * already-migrated load doesn't churn state.
 */
function migrateStorageProjects(
  storage: NodeWorkflowStorageSnapshot,
): NodeWorkflowStorageSnapshot {
  let changed = false
  const projects = storage.projects.map((project) => {
    const migratedState = migrateWorkflowState(project.state)
    if (migratedState === project.state) return project
    changed = true
    return { ...project, state: migratedState }
  })
  return changed ? { ...storage, projects } : storage
}

/**
 * Outcome of one localStorage persist attempt.
 *
 * `skipped` is the *deliberate* no-op (SSR, or the account-isolation guard
 * refusing to stamp one user's snapshot into another's slot) — it must never
 * be reported to the user. The other two are real failures: the local cache
 * stopped working and the user has no way to know unless we say so.
 */
const WORKFLOW_STORAGE_WRITE_OUTCOMES = {
  written: 'written',
  skipped: 'skipped',
  quotaExceeded: 'quota-exceeded',
  failed: 'failed',
} as const

type WorkflowStorageWriteOutcome =
  (typeof WORKFLOW_STORAGE_WRITE_OUTCOMES)[keyof typeof WORKFLOW_STORAGE_WRITE_OUTCOMES]

function isQuotaExceededError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return (
    NODE_STUDIO_WORKFLOW_STORAGE.quotaExceededErrorNames as readonly string[]
  ).includes(error.name)
}

/**
 * Persist the whole snapshot (every project, full state) under this user's
 * scoped key.
 *
 * ⚠ This write grows without bound: `MAX_PROJECTS_PER_USER` is 50, a
 * 40-node project serializes to ~70 KB, and Chromium bills localStorage in
 * UTF-16 code units — so a heavy account can walk into the ~5 MB ceiling.
 * When that happens the browser throws and **local persistence simply stops**.
 * The server copy is authoritative (see the server-hydration effect below),
 * so nothing is lost, but the user must be told — this used to be a bare
 * `catch { return }` and the failure was invisible.
 */
function writeWorkflowStorageToStorage(
  storage: NodeWorkflowStorageSnapshot,
  clerkId: string,
): WorkflowStorageWriteOutcome {
  if (typeof window === 'undefined') {
    return WORKFLOW_STORAGE_WRITE_OUTCOMES.skipped
  }

  // Refuse to persist a snapshot whose owner doesn't match the active
  // session — that means we're mid-account-switch and the in-memory
  // state is still the previous user's. Better to drop the write than
  // to stamp another account's data into this user's slot.
  if (storage.ownerClerkId !== clerkId) {
    return WORKFLOW_STORAGE_WRITE_OUTCOMES.skipped
  }

  // Declared outside the try so the failure log can report how big the
  // snapshot got. Serialization itself stays inside: a throw there (e.g.
  // RangeError on an absurd string length) must be logged like any other
  // persist failure, not escape uncaught from a setTimeout callback.
  let serialized = ''

  try {
    serialized = JSON.stringify(storage)
    window.localStorage.setItem(
      getNodeStudioWorkflowStorageKey(clerkId),
      serialized,
    )
    return WORKFLOW_STORAGE_WRITE_OUTCOMES.written
  } catch (error) {
    const quotaExceeded = isQuotaExceededError(error)
    logger.error('[node-workflow] localStorage persist failed', {
      quotaExceeded,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      projectCount: storage.projects.length,
      // Character count, not bytes: that's the unit Chromium's quota is
      // billed in, so this is the number to compare against ~5 MB. `0`
      // means serialization itself is what failed.
      snapshotChars: serialized.length,
    })
    return quotaExceeded
      ? WORKFLOW_STORAGE_WRITE_OUTCOMES.quotaExceeded
      : WORKFLOW_STORAGE_WRITE_OUTCOMES.failed
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
  const tToasts = useTranslations('StudioNode.toasts')
  /**
   * `t` behind a ref so `reportStorageWriteOutcome` can be identity-stable
   * (`[]` deps). It is listed in the hydration effect's dependencies, and
   * that effect resets the whole hydrate pipeline when it re-runs — a
   * reporter that changed identity on every render would re-hydrate the
   * canvas on every render.
   */
  const tToastsRef = useRef(tToasts)
  /**
   * 「本地暂存写不进去」一个会话只说一次。本地写入是 400ms 的 debounce——
   * 不抑制的话配额一满，用户每敲一下键盘就会再吃一次同样的 toast。
   * 故意不在成功写入后复位：同一次会话里反复提醒同一件事只是噪音。
   */
  const hasReportedStorageWriteFailure = useRef(false)
  const reportStorageWriteOutcome = useCallback(
    (outcome: WorkflowStorageWriteOutcome) => {
      if (
        outcome === WORKFLOW_STORAGE_WRITE_OUTCOMES.written ||
        outcome === WORKFLOW_STORAGE_WRITE_OUTCOMES.skipped
      ) {
        return
      }
      if (hasReportedStorageWriteFailure.current) {
        return
      }
      hasReportedStorageWriteFailure.current = true
      toast.error(
        outcome === WORKFLOW_STORAGE_WRITE_OUTCOMES.quotaExceeded
          ? tToastsRef.current('localCacheFull')
          : tToastsRef.current('localCacheUnavailable'),
      )
    },
    [],
  )
  /**
   * 「云端也保存不上」同样一个会话只弹一次 toast —— 自动保存是 5 秒 debounce，
   * 断网时不抑制就会每 5 秒复读一次同一句话。日志则**每次都记**：抑制的是
   * 噪音，不是证据。
   *
   * ⚠ 这是 `localCacheFull` / `localCacheUnavailable` 那两句「你的内容仍在
   * 保存到云端」成立的前提——云端要是也在静默失败，那句话就是假的。
   *
   * ⚠ `activate` 故意**不**走这里（见 `switchProject`）：它失败只丢一个
   * 「下次默认开哪个项目」的指针，共用这个一次性标志会让那种假阳性把后面
   * 真正的内容写入失败告警一并吃掉。
   */
  const hasReportedServerWriteFailure = useRef(false)
  const reportServerWriteFailure = useCallback(
    (operation: ServerWriteOperation, error?: string) => {
      logger.error('[node-workflow] server persist failed', {
        operation,
        error,
      })
      if (hasReportedServerWriteFailure.current) {
        return
      }
      hasReportedServerWriteFailure.current = true
      toast.error(tToastsRef.current('cloudSaveFailed'))
    },
    [],
  )
  useEffect(() => {
    tToastsRef.current = tToasts
  }, [tToasts])
  const parkedStorage = useMemo(
    () =>
      createDefaultWorkflowStorage(defaultProjectName, PARKED_OWNER_CLERK_ID),
    [defaultProjectName],
  )
  const [storageState, setStorageState] =
    useState<NodeWorkflowStorageSnapshot>(parkedStorage)
  const [hydrationStatus, setHydrationStatus] = useState<{
    clerkId: string | null
    defaultProjectName: string
    isComplete: boolean
  }>(() => ({
    clerkId,
    defaultProjectName,
    isComplete: false,
  }))
  if (
    hydrationStatus.clerkId !== clerkId ||
    hydrationStatus.defaultProjectName !== defaultProjectName
  ) {
    setHydrationStatus({
      clerkId,
      defaultProjectName,
      isComplete: false,
    })
  }
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
  /**
   * 本会话里**服务端亲口确认存在**的项目 id。只有它们才允许被写回服务端。
   *
   * 起因是一条数据丢失级的覆写链：`hasServerHydrated` 在 list 请求**失败**、
   * 回落到 localStorage 之后照样置 true（它管的是「水化流程走完没有」，还带着
   * `isHydrated` 那套 UI 语义），于是「网络抖一下 + 用户切个项目」就足以让本地
   * 那份可能陈旧的 state 在 5 秒后整体 PUT 覆盖掉服务端的好副本。
   *
   * 这个 Set 回答的是另一个问题：**这一份 state 到底是不是从服务端来的**。
   * 两个闸各管一件事，都留着，不合并。放 ref 不放 state —— 它只在写入路径上
   * 被读，进 state 只会白白多一轮渲染。
   */
  const serverConfirmedProjectIds = useRef<Set<string>>(new Set())
  /** 「未确认所以跳过写入」每个项目只警告一次：写入 effect 每次改动都会跑。 */
  const warnedUnconfirmedProjectIds = useRef<Set<string>>(new Set())
  /**
   * 「这个项目的空，是用户自己删空的」。服务端的空覆盖闸靠它放行。
   *
   * 画布没有「一键清空」入口，清空只能一个个删节点（或撤销回空），这些写入
   * 全部经过 `setWorkflowStorage`，所以那里是唯一的记账点。项目重新有了节点
   * 就撤掉记号：那之后再变空，得是**新一次**用户操作说了算。
   */
  const locallyClearedProjectIds = useRef<Set<string>>(new Set())
  const workflowHistory = useRef<{
    past: NodeWorkflowState[]
    future: NodeWorkflowState[]
  }>({
    past: [],
    future: [],
  })
  const historyProjectId = useRef<string | null>(null)
  const isRestoringHistory = useRef(false)
  /**
   * B2.5：一批写入正在进行中，撤销栈只在批次开头记一次账。
   *
   * ⚠ 实测出来的问题（2026-08-08，`assistant-ab-design-2026-08-08.md` §B2）：助手
   * 应用「3 项」后按撤销是 3→2→1→0，**一次只退一个节点**。根因是批次里每个
   * `add_node` 都各自走一遍 `commitCurrentProjectState`，而去重只比引用相等
   * （`storageRef.current` 同步更新，所以同一 tick 的连续调用不会被折叠）。
   *
   * 剧本投影（`applyScriptDocToGraph`）没有这个问题 —— 它先算完再一次性提交。
   * ops 那条路做不到「先算完」（建节点要先拿到真 id 才能连线），所以改用这个开关。
   */
  const historySuppressed = useRef(false)
  const [historyAvailability, setHistoryAvailability] = useState({
    canUndo: false,
    canRedo: false,
  })

  const publishHistoryAvailability = useCallback(() => {
    setHistoryAvailability({
      canUndo: workflowHistory.current.past.length > 0,
      canRedo: workflowHistory.current.future.length > 0,
    })
  }, [])

  const setWorkflowStorage = useCallback(
    (
      updater: (
        currentStorage: NodeWorkflowStorageSnapshot,
      ) => NodeWorkflowStorageSnapshot,
    ) => {
      if (!hasHydrated.current) {
        hasPreHydrationMutation.current = true
      }

      const previousStorage = storageRef.current
      const nextStorage = updater(previousStorage)

      // 记账「用户把当前项目删空了」。只看当前项目，而且只在 currentProjectId
      // 没变的那些写入里看 —— switchProject / deleteProject 会换掉它，那不是
      // 「清空」，把它们算进来就等于给空覆盖闸开了后门。
      const trackedProjectId = nextStorage.currentProjectId
      if (trackedProjectId === previousStorage.currentProjectId) {
        const before = previousStorage.projects.find(
          (project) => project.id === trackedProjectId,
        )
        const after = nextStorage.projects.find(
          (project) => project.id === trackedProjectId,
        )
        if (after && after.state.nodes.length > 0) {
          locallyClearedProjectIds.current.delete(trackedProjectId)
        } else if (after && before && before.state.nodes.length > 0) {
          locallyClearedProjectIds.current.add(trackedProjectId)
        }
      }

      storageRef.current = nextStorage
      setStorageState(nextStorage)
    },
    [],
  )

  const recordCurrentProjectHistory = useCallback(() => {
    // B2.5：批次进行中 —— 开头已经记过一次账，批内其余写入不再各记一笔。
    if (historySuppressed.current) return

    const currentProjectForHistory = getCurrentProject(
      storageRef.current,
      defaultProjectName,
    )
    if (historyProjectId.current !== currentProjectForHistory.id) {
      historyProjectId.current = currentProjectForHistory.id
      workflowHistory.current = {
        past: [],
        future: [],
      }
      publishHistoryAvailability()
    }

    const previousState = currentProjectForHistory.state
    const lastState =
      workflowHistory.current.past[workflowHistory.current.past.length - 1]
    if (lastState === previousState) {
      return
    }

    workflowHistory.current = {
      past: [...workflowHistory.current.past.slice(-49), previousState],
      future: [],
    }
    publishHistoryAvailability()
  }, [defaultProjectName, publishHistoryAvailability])

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
    // 换账号 = 换一整套项目 id。上一个账号确认过的 id 在这个账号里什么都不
    // 证明，留着就等于把账号隔离撕了一个口子。
    serverConfirmedProjectIds.current = new Set()
    warnedUnconfirmedProjectIds.current = new Set()
    locallyClearedProjectIds.current = new Set()
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
          reportStorageWriteOutcome(
            writeWorkflowStorageToStorage(storageRef.current, clerkId),
          )
        }, NODE_STUDIO_WORKFLOW_STORAGE.debounceMs)
        return
      }

      const hydratedStorage = migrateStorageProjects(
        readWorkflowStorageFromStorage(defaultProjectName, clerkId),
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
    // `reportStorageWriteOutcome` is `useCallback([])` — stable for the life
    // of the hook, so listing it here cannot re-trigger the hydrate.
  }, [clerkId, defaultProjectName, reportStorageWriteOutcome])

  useEffect(() => {
    if (!hasHydrated.current) {
      return
    }
    if (clerkId === null) return
    if (loadedForClerkId.current !== clerkId) return

    const timeoutId = window.setTimeout(() => {
      reportStorageWriteOutcome(
        writeWorkflowStorageToStorage(storageState, clerkId),
      )
    }, NODE_STUDIO_WORKFLOW_STORAGE.debounceMs)

    return () => window.clearTimeout(timeoutId)
  }, [clerkId, reportStorageWriteOutcome, storageState])

  // Server hydration: once localStorage has settled AND we know who's
  // signed in, pull the server-side project list. The server is the
  // source of truth — if it has projects, they replace local state. If
  // the server is empty, every local project **belonging to this user**
  // is uploaded once — including the empty bootstrap default, which is
  // how a brand-new user's very first session gets a server row at all.
  // Critically, we re-verify `storageRef.current.ownerClerkId === clerkId`
  // right before the migration POSTs run — that's the seatbelt that stops
  // a previous account's leftover local state from being uploaded as the
  // new user's projects.
  useEffect(() => {
    if (clerkId === null) return
    if (hasServerHydrated.current) return
    if (!hasHydrated.current) return
    if (loadedForClerkId.current !== clerkId) return

    let cancelled = false
    const completeHydration = () => {
      if (cancelled) return
      hasServerHydrated.current = true
      setHydrationStatus((current) =>
        current.clerkId === clerkId &&
        current.defaultProjectName === defaultProjectName
          ? { ...current, isComplete: true }
          : current,
      )
    }
    void (async () => {
      const response = await listNodeWorkflowProjectsAPI()
      if (cancelled) return

      // Network or auth failure — silently fall back to localStorage so the
      // user keeps editing offline. We'll retry sync on the next state
      // change via the write effect below.
      if (!response.success || !response.data) {
        completeHydration()
        return
      }

      const serverProjects = response.data
      const localSnapshot = storageRef.current

      if (serverProjects.length > 0) {
        // 唯一的登记点之一：这些 id 是服务端刚刚亲口报出来的，之后的写入
        // 才敢往它们身上 PUT。失败分支（上面那个 early return）**不登记**。
        for (const project of serverProjects) {
          serverConfirmedProjectIds.current.add(project.id)
        }
        const nextStorage: NodeWorkflowStorageSnapshot = {
          version: NODE_STUDIO_WORKFLOW_STORAGE.version,
          ownerClerkId: clerkId,
          currentProjectId: serverProjects[0].id,
          projects: serverProjects.map(projectFromServerRecord),
        }
        storageRef.current = nextStorage
        setStorageState(nextStorage)
        completeHydration()
        return
      }

      // Server is empty. Migration is only safe when the local snapshot
      // is provably owned by the user currently signed in — otherwise
      // we'd be POSTing a previous account's projects into this account.
      if (localSnapshot.ownerClerkId !== clerkId) {
        completeHydration()
        return
      }

      // ⚠ 这里**不看**本地有没有内容。原先有一条「空项目（就那个 bootstrap
      // 默认项目）不值得迁移」的短路，而新用户手里的项目恰恰就是空的 ——
      // 于是它**从来没有在服务端建过行**：整个第一次会话只活在 localStorage，
      // 要等到下次进页面、且那时本地已经有内容了，才顺着这条迁移路径上云。
      // 中间清一次缓存 / 换台设备 / 浏览器崩一次，第一次会话就整段没了。
      //
      // 更糟的是安静：下面写入 effect 的 `serverConfirmedProjectIds` 闸会把这
      // 期间的每一次写入都跳过（这个 id 服务端从没确认过），连原来每 5 秒撞一
      // 次 404 的动静都没有了。代价是给空项目多发一次 POST，换来的是
      // 「进过画布 = 云端有它的行」。
      //
      // ⚠ 触发条件必须留在「list 成功且返回空」上，不能放宽成「当前项目没被
      // 确认过就补建」：list **失败**后本地项目同样是未确认状态，但服务端那行
      // 是存在的，照着补建就是凭空多一行重复项目。
      if (!hasServerMigrationAttempted.current) {
        hasServerMigrationAttempted.current = true
        // 这是**一次性**上传：`hasServerMigrationAttempted` 之后不再重试。
        // 原来这个循环连返回值都不看 —— 上传全挂 → 下面 refetch 返回空 →
        // 静默走回本地分支 → 用户以为已经同步了。
        let migrationFailed = false
        for (const project of localSnapshot.projects) {
          const created = await createNodeWorkflowProjectAPI({
            name: project.name,
            state: project.state,
          })
          if (cancelled) return
          if (!created.success || !created.data) {
            migrationFailed = true
            reportServerWriteFailure(
              SERVER_WRITE_OPERATIONS.migrate,
              created.error,
            )
            break
          }
        }

        // ⚠ 只在**整批**都上去了之后才做下面那步替换。下面是拿服务端结果
        // **整体替换本地快照**——只传上去一半就替换，等于把没传成功的那几个
        // 项目从本地内存里也一并抹掉。宁可让本地那份原样留着，等下次进页面
        // 重跑迁移（这个标志只是 ref，刷新即复位）。
        if (!migrationFailed) {
          // Re-fetch to pick up server-assigned ids, then re-run the hydrate
          // path so the canvas swaps to the migrated copy.
          const refetch = await listNodeWorkflowProjectsAPI()
          if (cancelled) return
          if (refetch.success && refetch.data && refetch.data.length > 0) {
            for (const project of refetch.data) {
              serverConfirmedProjectIds.current.add(project.id)
            }
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
      }

      completeHydration()
    })()

    return () => {
      cancelled = true
    }
    // Re-checked on every state tick so the "wait until localStorage
    // hydrated" gate eventually opens the server hydrate.
    // `reportServerWriteFailure` is `useCallback([])` — identity-stable, so
    // listing it cannot re-trigger the hydrate.
  }, [clerkId, defaultProjectName, reportServerWriteFailure, storageState])

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

    // ⚠ 覆写链的客户端这一头。`hasServerHydrated` 上面那条闸拦不住 list 请求
    // 失败后的回落——它在失败分支里也会置 true。只有服务端本会话亲口确认过
    // 的项目才允许被写回去；没确认过就说明手里这份 state 来路不明（陈旧的
    // localStorage 快照、或干脆是清过站点数据后的空壳），PUT 上去就是拿它
    // 覆盖服务端那份好的。
    if (!serverConfirmedProjectIds.current.has(currentId)) {
      if (!warnedUnconfirmedProjectIds.current.has(currentId)) {
        warnedUnconfirmedProjectIds.current.add(currentId)
        logger.warn(
          '[node-workflow] skipped server write: project not confirmed by the server this session',
          { projectId: currentId },
        )
      }
      return
    }

    const timeoutId = window.setTimeout(() => {
      void updateNodeWorkflowProjectAPI(currentId, {
        state: current.state,
        // 服务端默认拒绝「空覆盖非空」。只有本地亲眼看见用户把它删空时才
        // 放行——见 `locallyClearedProjectIds`。
        allowEmptyState: locallyClearedProjectIds.current.has(currentId),
      }).then((response) => {
        if (!response.success) {
          reportServerWriteFailure(
            SERVER_WRITE_OPERATIONS.update,
            response.error,
          )
        }
      })
    }, SERVER_WRITE_DEBOUNCE_MS)

    return () => window.clearTimeout(timeoutId)
  }, [clerkId, reportServerWriteFailure, storageState])

  const currentProject = useMemo(
    () => getCurrentProject(storageState, defaultProjectName),
    [defaultProjectName, storageState],
  )
  const state = currentProject.state
  const isHydrated =
    clerkId !== null &&
    hydrationStatus.clerkId === clerkId &&
    hydrationStatus.defaultProjectName === defaultProjectName &&
    hydrationStatus.isComplete
  const projects = useMemo(
    () => getProjectSummaries(storageState.projects),
    [storageState.projects],
  )

  useEffect(() => {
    if (historyProjectId.current === currentProject.id) {
      return
    }

    historyProjectId.current = currentProject.id
    workflowHistory.current = {
      past: [],
      future: [],
    }
    publishHistoryAvailability()
  }, [currentProject.id, publishHistoryAvailability])

  const commitCurrentProjectState = useCallback(
    (updater: (currentState: NodeWorkflowState) => NodeWorkflowState) => {
      recordCurrentProjectHistory()
      setWorkflowStorage((currentStorage) =>
        patchCurrentProjectState(currentStorage, defaultProjectName, updater),
      )
    },
    [defaultProjectName, recordCurrentProjectHistory, setWorkflowStorage],
  )

  /**
   * B2.5：把 `run` 里的所有写入合并成**一个**撤销步。
   *
   * 用法是包住一整批高层动作（建节点 / 连线 / 改名…），而不是包住某一次
   * `commitCurrentProjectState` —— 批内那些动作各自调什么、调几次，调用方不需要知道。
   *
   * ⚠ **有意跨 await 保持开着**：一批 op 是一次用户决定，中间的异步步骤不该把它
   * 劈成两个撤销步。批次进行时 UI 的按钮是禁用的（`structuralRunning`），所以
   * 「批次期间用户又手动改了画布」这种并发在实际路径上够不到。
   *
   * 嵌套时内层直接透传：外层已经记过账，内层再记一次就又变成两步了。
   */
  const runAsSingleHistoryStep = useCallback(
    async <T>(run: () => T | Promise<T>): Promise<T> => {
      if (historySuppressed.current) return run()
      recordCurrentProjectHistory()
      historySuppressed.current = true
      try {
        return await run()
      } finally {
        historySuppressed.current = false
      }
    },
    [recordCurrentProjectHistory],
  )

  const addNode = useCallback(
    (type: NodeWorkflowNodeType, position: XYPosition) => {
      const nodeId = createWorkflowId(NODE_STUDIO_ID_PREFIXES.node)
      // Resizable card shells need an explicit RF size at creation so a
      // freshly-added node renders at a real size before anything is
      // measured. videoReference still owns a corner NodeResizer, so it
      // still needs this. `image` no longer does — S4（2026-07-27，
      // canvas-image-card.md §2「不提供拖拽把手」）retired LooseImageCard's
      // NodeResizer in favor of an aspect-ratio-derived, clamped size that
      // the card computes itself and applies as its own inline style;
      // leaving an explicit pinned width/height here would fight that (RF
      // applies `node.width`/`height` as a literal CSS size on the node
      // wrapper whenever they're set, which would clip/stretch the card's
      // own aspect-correct box). `image` now falls into the same
      // "role-stamped cards keep measuring from content" bucket as
      // composer/agent/voice/collector.
      const needsExplicitSize = type === NODE_TYPE_IDS.videoReference
      const nextNode: NodeWorkflowNode = {
        id: nodeId,
        type,
        position,
        data: createDefaultNodeData(type),
        ...(needsExplicitSize
          ? {
              width: NODE_STUDIO_LOOSE_IMAGE_DEFAULT_SIZE,
              height: NODE_STUDIO_LOOSE_IMAGE_DEFAULT_SIZE,
            }
          : {}),
      }

      commitCurrentProjectState((currentState) => ({
        ...currentState,
        nodes: [...currentState.nodes, nextNode],
      }))

      return nodeId
    },
    [commitCurrentProjectState],
  )

  const placeDerivedImages = useCallback(
    (
      sourceNodeId: string,
      outputs: readonly CanvasDerivedImageOutput[],
    ): string[] => {
      const parsedOutputs = CanvasDerivedImageOutputsSchema.safeParse(outputs)
      if (!parsedOutputs.success) {
        return []
      }

      const currentState = getCurrentProject(
        storageRef.current,
        defaultProjectName,
      ).state
      const sourceNode = currentState.nodes.find(
        (node) => node.id === sourceNodeId,
      )
      const sourceImageUrl =
        sourceNode?.data.mediaUrl ?? sourceNode?.data.imageUrl
      // Prefer explicit mediaKind; fall back to type map; finally infer image
      // when a remote media URL is present (role-stamped `image` nodes often
      // omit mediaKind after createDefaultNodeData).
      const sourceMediaKind = sourceNode
        ? (sourceNode.data.mediaKind ??
          NODE_MEDIA_KIND_BY_NODE_TYPE[sourceNode.type] ??
          (sourceImageUrl?.trim() ? NODE_MEDIA_KIND_IDS.image : undefined))
        : undefined

      if (
        !sourceNode ||
        sourceMediaKind !== NODE_MEDIA_KIND_IDS.image ||
        !sourceImageUrl?.trim()
      ) {
        return []
      }

      const derivedFromGenerationId =
        sourceNode.data.generationId ?? sourceNode.data.sourceGenerationId
      const placement = NODE_STUDIO_NODE_PLACEMENT.derivedImage
      const nextNodes = parsedOutputs.data.map((output, index) => {
        const nodeId = createWorkflowId(NODE_STUDIO_ID_PREFIXES.node)
        const column = index % placement.columns
        const row = Math.floor(index / placement.columns)
        const nextData: NodeWorkflowNodeData = {
          ...createDefaultNodeData(NODE_TYPE_IDS.image),
          imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.generated,
          mediaKind: NODE_MEDIA_KIND_IDS.image,
          mediaUrl: output.imageUrl,
          generationStatus: NODE_GENERATION_STATUS_IDS.success,
          status: NODE_STATUS_IDS.done,
          derivedFromNodeId: sourceNode.id,
          editCapability: output.editCapability,
          ...(output.width === undefined ? {} : { mediaWidth: output.width }),
          ...(output.height === undefined
            ? {}
            : { mediaHeight: output.height }),
          ...(output.generationId ? { generationId: output.generationId } : {}),
          ...(output.sourceGenerationId
            ? { derivedFromGenerationId: output.sourceGenerationId }
            : {}),
          ...(output.label
            ? { mediaLabel: output.label, sourceLabel: output.label }
            : {}),
          ...(derivedFromGenerationId && !output.sourceGenerationId
            ? { derivedFromGenerationId }
            : {}),
        }

        return {
          id: nodeId,
          type: NODE_TYPE_IDS.image,
          position: {
            x:
              sourceNode.position.x +
              placement.offsetX +
              column * placement.columnOffsetX,
            y: sourceNode.position.y + row * placement.rowOffsetY,
          },
          // S4（2026-07-27）：不再钉死初始 320×320——LooseImageCard 自己按
          // output.width/height（下面写进 data.mediaWidth/Height）算出正确的
          // 钳制尺寸并测量渲染，钉一个假方形反而会在它自己的尺寸生效前抢跑
          // 一帧。见 addNode 里 needsExplicitSize 的同一条注释。
          data: nextData,
        } satisfies NodeWorkflowNode
      })

      commitCurrentProjectState((latestState) => ({
        ...latestState,
        nodes: [...latestState.nodes, ...nextNodes],
      }))

      return nextNodes.map((node) => node.id)
    },
    [commitCurrentProjectState, defaultProjectName],
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

  /**
   * 给一个刚在本地建出来的项目在服务端建行。**每一条「本地凭空多出一个项目」
   * 的路径都必须走这里**（新建项目、删掉最后一个项目后补的替代项目）。
   *
   * Fire-and-forget。成功但 id 不同（服务端自己发 UUID）就把本地 id 改写成服务
   * 端的，否则后续写入 / activate 打的是一个不存在的行；失败就报出来，本地那份
   * 继续留着，等下次刷新由服务端水化那条路收拾。
   *
   * ⚠ 登记 `serverConfirmedProjectIds` 是这里最要紧的一步（id 变没变都要登记）。
   * 没登记的项目会被写入 effect 那条「本会话服务端确认过」的闸挡下 —— 每次写入
   * 直接 return，只留一条用户看不见的 warn，`saveNow` 也直接返回 false 弹「保存
   * 失败」。用户这一会话画的东西全都不上云。
   */
  const createProjectOnServer = useCallback(
    (project: NodeWorkflowProject) => {
      void createNodeWorkflowProjectAPI({
        name: project.name,
        state: project.state,
      }).then((response) => {
        if (!response.success || !response.data) {
          reportServerWriteFailure(
            SERVER_WRITE_OPERATIONS.create,
            response.error,
          )
          return
        }

        const serverId = response.data.id
        serverConfirmedProjectIds.current.add(serverId)
        if (serverId === project.id) return

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
      })
    },
    [reportServerWriteFailure, setWorkflowStorage],
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

      if (canCallServerNow()) {
        createProjectOnServer(project)
      }

      return project.id
    },
    [
      canCallServerNow,
      createProjectOnServer,
      defaultProjectName,
      setWorkflowStorage,
    ],
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
        // ⚠ 只记日志，**不弹 toast**，也**不共用**内容写入那个一次性抑制标志。
        // 两个理由，缺一不可：
        // 1. activate 失败丢的只是「下次默认开哪个项目」这个指针，画布内容
        //    一点风险都没有——套「你的内容没保存」那句话是假警报。
        // 2. 更要命的是，如果共用一次性标志，这种假阳性会把后面**真正**的
        //    state 写入失败告警一并吃掉——用户从此再也收不到该收的警报。
        void activateNodeWorkflowProjectAPI(id).then((response) => {
          if (!response.success) {
            logger.error('[node-workflow] server persist failed', {
              operation: SERVER_WRITE_OPERATIONS.activate,
              error: response.error,
            })
          }
        })
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
        // 只送 name，不带 state —— 改名不该顺手把画布也推一遍。
        void updateNodeWorkflowProjectAPI(renamedId, {
          name: renamedName,
        }).then((response) => {
          if (!response.success) {
            reportServerWriteFailure(
              SERVER_WRITE_OPERATIONS.rename,
              response.error,
            )
          }
        })
      }
    },
    [
      canCallServerNow,
      defaultProjectName,
      reportServerWriteFailure,
      setWorkflowStorage,
    ],
  )

  const deleteProject = useCallback(
    (id: string): NodeWorkflowProjectSummary | null => {
      const snapshot = storageRef.current
      const targetProject = snapshot.projects.find(
        (project) => project.id === id,
      )

      if (!targetProject) {
        return null
      }

      const remainingProjects = snapshot.projects.filter(
        (project) => project.id !== id,
      )

      // 删掉最后一个项目时本地立刻补一个空项目顶上。它必须**在这里**先建出来，
      // 好走下面 `createProjectOnServer` 那条建行 + 登记 id 的路。
      //
      // ⚠ 原先它是在 `setWorkflowStorage` 的 updater 里现造的，没有任何人给它在
      // 服务端建行：这个新 id 于是从没被服务端确认过，写入 effect 对它的每一次
      // 写入都 return（只留一条用户看不见的 warn），`saveNow` 直接返回 false 让
      // 工作台弹「保存失败」。用户删完最后一个项目后接着画的东西整个会话都不
      // 上云，要等下次刷新、服务端 list 返回空、走一次性迁移路径才补上。
      const replacementProject =
        remainingProjects.length === 0
          ? createWorkflowProject(
              normalizeProjectName(defaultProjectName, defaultProjectName),
              createEmptyWorkflowState(),
            )
          : null

      setWorkflowStorage((currentStorage) =>
        replacementProject
          ? createWorkflowStorageFromProject(
              replacementProject,
              currentStorage.ownerClerkId,
            )
          : {
              ...currentStorage,
              currentProjectId:
                currentStorage.currentProjectId === id
                  ? remainingProjects[0].id
                  : currentStorage.currentProjectId,
              projects: remainingProjects,
            },
      )

      serverConfirmedProjectIds.current.delete(id)
      warnedUnconfirmedProjectIds.current.delete(id)
      locallyClearedProjectIds.current.delete(id)

      if (canCallServerNow()) {
        void deleteNodeWorkflowProjectAPI(id).then((response) => {
          if (!response.success) {
            reportServerWriteFailure(
              SERVER_WRITE_OPERATIONS.delete,
              response.error,
            )
          }
        })

        if (replacementProject) {
          createProjectOnServer(replacementProject)
        }
      }

      return getProjectSummaries([targetProject])[0] ?? null
    },
    [
      canCallServerNow,
      createProjectOnServer,
      defaultProjectName,
      reportServerWriteFailure,
      setWorkflowStorage,
    ],
  )

  const updateNodeData = useCallback(
    (id: string, patch: Partial<NodeWorkflowNodeData>) => {
      setWorkflowStorage((currentStorage) =>
        patchCurrentProjectState(
          currentStorage,
          defaultProjectName,
          (currentState) => {
            const nodes = currentState.nodes.map((node) =>
              node.id === id
                ? {
                    ...node,
                    data: {
                      ...node.data,
                      ...patch,
                    },
                  }
                : node,
            )
            // owner 2026-08-02：「助手这边只是自动生成，不用助手则用户手动
            // 输入然后生成 —— 是一种东西」。所以镜头文本不是「助手的产物」，
            // 是「一镜的文字定义」，助手只是填它的一种方式。
            //
            // 由此：投影出来的 shotText 节点（带 scriptRef）在节点上被编辑时
            // 必须回写 ScriptDoc，否则下一次投影会把用户的修改覆盖掉 —— 那
            // 不是「保护剧本」，只是两份数据没对齐。手工添加的节点没有
            // scriptRef（见 NodeWorkflowNodeDataSchema 该字段注释），本来就
            // 不受投影管辖，这里也自然跳过。
            //
            // ⚠ 落点选在这里而不是各个编辑组件里：`scriptDoc` 与 `nodes` 同在
            // 一个 state 对象上，这一次 setState 就能把两者原子更新，且以后
            // 任何新增的编辑入口都自动一致，不必各自记得回写。
            const scriptDoc = syncShotTextPatchToScriptDoc(
              currentState.scriptDoc,
              currentState.nodes.find((node) => node.id === id),
              patch,
            )
            return scriptDoc === currentState.scriptDoc
              ? { ...currentState, nodes }
              : { ...currentState, nodes, scriptDoc }
          },
        ),
      )
    },
    [defaultProjectName, setWorkflowStorage],
  )

  // R3-6b §3 每镜覆写: shallow-merges `patch` into the edge's `data`, same
  // "no history entry" treatment as `updateNodeData` (a checkbox toggle
  // shouldn't spam the undo stack any more than typing in a prompt field
  // does — structural ops like onConnect/deleteEdge still go through
  // `commitCurrentProjectState`, which DOES record history).
  const updateEdgeData = useCallback(
    (id: string, patch: Partial<NodeWorkflowEdgeData>) => {
      setWorkflowStorage((currentStorage) =>
        patchCurrentProjectState(
          currentStorage,
          defaultProjectName,
          (currentState) => ({
            ...currentState,
            edges: currentState.edges.map((edge) =>
              edge.id === id
                ? {
                    ...edge,
                    data: {
                      ...edge.data,
                      ...patch,
                    },
                  }
                : edge,
            ),
          }),
        ),
      )
    },
    [defaultProjectName, setWorkflowStorage],
  )

  const deleteNode = useCallback(
    (id: string) => {
      commitCurrentProjectState((currentState) => ({
        ...currentState,
        nodes: currentState.nodes.filter((node) => node.id !== id),
        edges: currentState.edges.filter(
          (edge) => edge.source !== id && edge.target !== id,
        ),
      }))
    },
    [commitCurrentProjectState],
  )

  const deleteEdge = useCallback(
    (id: string) => {
      const currentState = getCurrentProject(
        storageRef.current,
        defaultProjectName,
      ).state
      if (!currentState.edges.some((edge) => edge.id === id)) {
        return
      }

      commitCurrentProjectState((latestState) => ({
        ...latestState,
        edges: latestState.edges.filter((edge) => edge.id !== id),
      }))
    },
    [commitCurrentProjectState, defaultProjectName],
  )

  const setScriptDoc = useCallback(
    (scriptDoc: ScriptDoc | undefined) => {
      setWorkflowStorage((currentStorage) =>
        patchCurrentProjectState(
          currentStorage,
          defaultProjectName,
          (currentState) => ({
            ...currentState,
            scriptDoc,
          }),
        ),
      )
    },
    [defaultProjectName, setWorkflowStorage],
  )

  const setCanvasAppearance = useCallback(
    (value: CanvasAppearance | undefined) => {
      setWorkflowStorage((currentStorage) =>
        patchCurrentProjectState(
          currentStorage,
          defaultProjectName,
          (currentState) => ({
            ...currentState,
            canvasAppearance: value,
          }),
        ),
      )
    },
    [defaultProjectName, setWorkflowStorage],
  )

  const setScriptDocStage = useCallback(
    (value: ScriptDocStage) => {
      setWorkflowStorage((currentStorage) =>
        patchCurrentProjectState(
          currentStorage,
          defaultProjectName,
          (currentState) => ({ ...currentState, scriptDocStage: value }),
        ),
      )
    },
    [defaultProjectName, setWorkflowStorage],
  )

  const setScriptDocDepth = useCallback(
    (value: ScriptDocDepth) => {
      setWorkflowStorage((currentStorage) =>
        patchCurrentProjectState(
          currentStorage,
          defaultProjectName,
          (currentState) => ({ ...currentState, scriptDocDepth: value }),
        ),
      )
    },
    [defaultProjectName, setWorkflowStorage],
  )

  const setScriptDocLocks = useCallback(
    (value: string[]) => {
      setWorkflowStorage((currentStorage) =>
        patchCurrentProjectState(
          currentStorage,
          defaultProjectName,
          (currentState) => ({ ...currentState, scriptDocLocks: value }),
        ),
      )
    },
    [defaultProjectName, setWorkflowStorage],
  )

  const setScriptDocShotStills = useCallback(
    (value: boolean) => {
      setWorkflowStorage((currentStorage) =>
        patchCurrentProjectState(
          currentStorage,
          defaultProjectName,
          (currentState) => ({ ...currentState, scriptDocShotStills: value }),
        ),
      )
    },
    [defaultProjectName, setWorkflowStorage],
  )

  /**
   * B4：**投影会删节点** —— 它拥有的节点（带 `scriptRef`）在对应的角色/镜头/台词
   * 被从剧本里删掉后就成了孤儿，投影会一并移除。改之前用户只能从事后那个 toast
   * 里读到「移除 N 个」，事前看不见。
   *
   * 这里跑与 `applyScriptDocToGraph` 完全相同的计算但**不提交**，让工作区能在按下
   * 之前把「将建 / 将更新 / 将移除」摆出来。
   *
   * ⚠ 预览与随后的实投是**两次独立计算**（`makeId` 每次生成新 id）。计数因此只对
   * 「预览那一刻的图」成立 —— 确认是紧接着的一下，中间没有别的写入路径，所以够用；
   * 但别把预览结果缓存起来当成实投的结果用。
   */
  const previewScriptDocProjection = useCallback((): ApplyScriptDocResult => {
    const currentState = getCurrentProject(
      storageRef.current,
      defaultProjectName,
    ).state
    const scriptDoc = currentState.scriptDoc
    if (!scriptDoc) {
      return {
        created: 0,
        updated: 0,
        skipped: 0,
        removed: 0,
        removedEdges: 0,
        refusal: 'noScriptDoc',
      }
    }
    if (scriptDoc.roles.length === 0 && scriptDoc.shots.length === 0) {
      return {
        created: 0,
        updated: 0,
        skipped: 0,
        removed: 0,
        removedEdges: 0,
        refusal: 'emptyScriptDoc',
      }
    }

    const result = projectScriptDocToGraph(scriptDoc, currentState, {
      makeId: createWorkflowId,
      anchor: NODE_STUDIO_NODE_PLACEMENT.scriptDocSpawn.origin,
      shotStills: currentState.scriptDocShotStills,
    })

    return {
      created: result.nodesToAdd.length,
      updated: result.nodesToUpdate.length,
      skipped: result.skipped,
      removed: result.nodesToRemove.length,
      removedEdges: result.edgesToRemove.length,
      refusal: null,
    }
  }, [defaultProjectName])

  /**
   * Project the current project's ScriptDoc into the graph. Reads the latest
   * state off `storageRef` (never a stale closure), runs the pure idempotent
   * projection, and appends only genuinely new nodes/edges inside a single
   * `patchCurrentProjectState`. Re-running with the same doc is a no-op.
   */
  const applyScriptDocToGraph = useCallback((): ApplyScriptDocResult => {
    const currentState = getCurrentProject(
      storageRef.current,
      defaultProjectName,
    ).state
    const scriptDoc = currentState.scriptDoc
    if (!scriptDoc) {
      return {
        created: 0,
        updated: 0,
        skipped: 0,
        removed: 0,
        removedEdges: 0,
        refusal: 'noScriptDoc',
      }
    }
    if (scriptDoc.roles.length === 0 && scriptDoc.shots.length === 0) {
      return {
        created: 0,
        updated: 0,
        skipped: 0,
        removed: 0,
        removedEdges: 0,
        refusal: 'emptyScriptDoc',
      }
    }

    const result = projectScriptDocToGraph(scriptDoc, currentState, {
      makeId: createWorkflowId,
      anchor: NODE_STUDIO_NODE_PLACEMENT.scriptDocSpawn.origin,
      // Absent on every project that predates the toggle → 默认开.
      shotStills: currentState.scriptDocShotStills,
    })

    if (
      result.nodesToAdd.length === 0 &&
      result.nodesToUpdate.length === 0 &&
      result.nodesToRemove.length === 0 &&
      result.edgesToAdd.length === 0 &&
      result.edgesToRemove.length === 0
    ) {
      return {
        created: 0,
        updated: 0,
        skipped: result.skipped,
        removed: 0,
        removedEdges: 0,
        refusal: null,
      }
    }

    commitCurrentProjectState((latestState) => {
      const updatesById = new Map(
        result.nodesToUpdate.map((update) => [update.id, update.data]),
      )
      const removeEdgeIds = new Set(result.edgesToRemove.map((edge) => edge.id))
      const removeNodeIds = new Set(result.nodesToRemove.map((node) => node.id))

      return {
        ...latestState,
        nodes: [
          ...latestState.nodes
            .filter((node) => !removeNodeIds.has(node.id))
            .map((node) => {
              const patch = updatesById.get(node.id)
              if (!patch) return node
              return {
                ...node,
                data: {
                  ...node.data,
                  ...patch,
                },
              }
            }),
          ...result.nodesToAdd,
        ],
        edges: [
          ...latestState.edges.filter((edge) => !removeEdgeIds.has(edge.id)),
          ...result.edgesToAdd,
        ],
      }
    })

    return {
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      removed: result.removed,
      removedEdges: result.removedEdges,
      refusal: null,
    }
  }, [commitCurrentProjectState, defaultProjectName])

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
      const shouldRecordHistory = changes.some(
        (change) => change.type !== 'select' && change.type !== 'dimensions',
      )
      if (shouldRecordHistory && !isRestoringHistory.current) {
        recordCurrentProjectHistory()
      }

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
    [defaultProjectName, recordCurrentProjectHistory, setWorkflowStorage],
  )

  const onEdgesChange = useCallback<OnEdgesChange<NodeWorkflowEdge>>(
    (changes) => {
      const shouldRecordHistory = changes.some(
        (change) => change.type !== 'select',
      )
      if (shouldRecordHistory && !isRestoringHistory.current) {
        recordCurrentProjectHistory()
      }

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
    [defaultProjectName, recordCurrentProjectHistory, setWorkflowStorage],
  )

  const saveNow = useCallback(async (): Promise<boolean> => {
    if (!canCallServerNow()) return false
    const snapshot = storageRef.current
    const currentId = snapshot.currentProjectId
    const current = snapshot.projects.find((p) => p.id === currentId)
    if (!current) return false
    // 手动保存走同一条闸。服务端水化失败时，用户手里这份 state 同样来路不明
    // ——「手动点的」不代表它比服务端那份新。这里返回 false，调用方
    // （StudioNodeWorkbench 的保存按钮）会照常弹「保存失败」，所以是**可见**
    // 的拒绝，不是静默吞掉。
    if (!serverConfirmedProjectIds.current.has(currentId)) {
      logger.warn(
        '[node-workflow] skipped manual save: project not confirmed by the server this session',
        { projectId: currentId },
      )
      return false
    }
    const response = await updateNodeWorkflowProjectAPI(currentId, {
      state: current.state,
      allowEmptyState: locallyClearedProjectIds.current.has(currentId),
    })
    return response.success
  }, [canCallServerNow])

  const tidyLayout = useCallback(() => {
    commitCurrentProjectState((currentState) => ({
      ...currentState,
      nodes: applyDagreLayout(currentState.nodes, currentState.edges),
    }))
  }, [commitCurrentProjectState])

  const onConnect = useCallback(
    (connection: Connection) => {
      const edgeId = createWorkflowId(NODE_STUDIO_ID_PREFIXES.edge)
      commitCurrentProjectState((currentState) => ({
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
    [commitCurrentProjectState],
  )

  const undo = useCallback(() => {
    const previousState =
      workflowHistory.current.past[workflowHistory.current.past.length - 1]
    if (!previousState) {
      return
    }

    const currentState = getCurrentProject(
      storageRef.current,
      defaultProjectName,
    ).state
    workflowHistory.current = {
      past: workflowHistory.current.past.slice(0, -1),
      future: [currentState, ...workflowHistory.current.future.slice(0, 49)],
    }
    isRestoringHistory.current = true
    publishHistoryAvailability()
    setWorkflowStorage((currentStorage) =>
      patchCurrentProjectState(
        currentStorage,
        defaultProjectName,
        () => previousState,
      ),
    )
    window.setTimeout(() => {
      isRestoringHistory.current = false
    }, 300)
  }, [defaultProjectName, publishHistoryAvailability, setWorkflowStorage])

  const redo = useCallback(() => {
    const [nextState, ...remainingFuture] = workflowHistory.current.future
    if (!nextState) {
      return
    }

    const currentState = getCurrentProject(
      storageRef.current,
      defaultProjectName,
    ).state
    workflowHistory.current = {
      past: [...workflowHistory.current.past.slice(-49), currentState],
      future: remainingFuture,
    }
    isRestoringHistory.current = true
    publishHistoryAvailability()
    setWorkflowStorage((currentStorage) =>
      patchCurrentProjectState(
        currentStorage,
        defaultProjectName,
        () => nextState,
      ),
    )
    window.setTimeout(() => {
      isRestoringHistory.current = false
    }, 300)
  }, [defaultProjectName, publishHistoryAvailability, setWorkflowStorage])

  return useMemo(
    () => ({
      isHydrated,
      state,
      scriptDoc: state.scriptDoc,
      canvasAppearance: state.canvasAppearance,
      scriptDocStage: state.scriptDocStage,
      scriptDocDepth: state.scriptDocDepth,
      scriptDocLocks: state.scriptDocLocks,
      scriptDocShotStills: state.scriptDocShotStills,
      nodes: state.nodes,
      edges: state.edges,
      projects,
      currentProjectId: currentProject.id,
      currentProjectName: currentProject.name,
      addNode,
      placeDerivedImages,
      createProject,
      switchProject,
      renameCurrentProject,
      deleteProject,
      updateNodeData,
      updateEdgeData,
      setScriptDoc,
      setCanvasAppearance,
      setScriptDocStage,
      setScriptDocDepth,
      setScriptDocLocks,
      setScriptDocShotStills,
      applyScriptDocToGraph,
      previewScriptDocProjection,
      deleteNode,
      deleteEdge,
      undo,
      redo,
      canUndo: historyAvailability.canUndo,
      canRedo: historyAvailability.canRedo,
      runAsSingleHistoryStep,
      getOutgoingTargetByType,
      onNodesChange,
      onEdgesChange,
      onConnect,
      tidyLayout,
      saveNow,
    }),
    [
      addNode,
      applyScriptDocToGraph,
      createProject,
      currentProject.id,
      currentProject.name,
      deleteEdge,
      deleteNode,
      deleteProject,
      getOutgoingTargetByType,
      historyAvailability.canRedo,
      historyAvailability.canUndo,
      isHydrated,
      onConnect,
      onEdgesChange,
      onNodesChange,
      placeDerivedImages,
      previewScriptDocProjection,
      runAsSingleHistoryStep,
      projects,
      redo,
      renameCurrentProject,
      saveNow,
      setScriptDoc,
      setCanvasAppearance,
      setScriptDocStage,
      setScriptDocDepth,
      setScriptDocLocks,
      setScriptDocShotStills,
      state,
      switchProject,
      tidyLayout,
      undo,
      updateEdgeData,
      updateNodeData,
    ],
  )
}
