'use client'

/**
 * 画布的**持久化层**（第三期 · 画布 C3c-③c）。
 *
 * ── 与 `use-node-graph-v4.ts` 的分工 ──────────────────────────────────────
 * 这里只管「项目这份数据从哪来、往哪去」：项目列表 / 当前项目 / 本地暂存 /
 * 服务端水化 / 自动保存 / 空覆盖闸 / 账号隔离 / **v3→v4 升级的备份门**。
 * 图引擎（建点、连线、投影、撤销）留在 `use-node-graph-v4.ts`。
 *
 * ── ⚠ 存储的事实形状是 v4 ────────────────────────────────────────────────
 * `state` 一律是 `NodeWorkflowStateV4`。读到服务端透传的 v3 时的顺序**不能反**：
 *
 *   v3 记录 → `POST /api/studio/node-workflow/[id]/backup` **成功** →
 *   `upgradeNodeWorkflowStateToV4` → 内存里持有 v4 → 下一次正常写入落库成 v4
 *
 * 备份失败 → **不升级、不写、只读**，并给用户一句看得见的话（`v3UpgradeReadOnly`）。
 * 静默失败等于用户的 v3 原件在 5 秒后被覆盖且没有退路。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  getNodeStudioWorkflowStorageKey,
  NODE_STUDIO_ID_PREFIXES,
  NODE_STUDIO_PROJECTS,
  NODE_STUDIO_WORKFLOW_STORAGE,
} from '@/constants/node-studio'
import {
  activateNodeWorkflowProjectAPI,
  backupNodeWorkflowV3StateAPI,
  createNodeWorkflowProjectAPI,
  deleteNodeWorkflowProjectAPI,
  getNodeWorkflowProjectAPI,
  listNodeWorkflowProjectsAPI,
  updateNodeWorkflowProjectAPI,
} from '@/lib/api-client'
import { logger } from '@/lib/logger'
import { mergeAdoptedProjects } from '@/lib/node-workflow-adopt-merge'
import { migrateRetireFusedNodes } from '@/lib/node-workflow-migrate-fused-nodes'
import { migrateRetirePlanner } from '@/lib/node-workflow-migrate-planner'
import { migrateImageRoles } from '@/lib/node-workflow-migrate-image-roles'
import { migrateVoiceClip } from '@/lib/node-workflow-migrate-voice-clip'
import {
  migrateNodeWorkflowStateToV4,
  type V3State,
} from '@/lib/node-workflow-migrate-v4'
import { upgradeNodeWorkflowStateToV4 } from '@/lib/node-workflow-v4-upgrade'
import {
  NodeWorkflowLegacyV2StorageSchema,
  NodeWorkflowStateSchema,
  NodeWorkflowStorageSchema,
  NodeWorkflowStorageV4Schema,
  type NodeWorkflowProjectRecord,
  type NodeWorkflowProjectSummary,
  type NodeWorkflowProjectV4,
  type NodeWorkflowState,
  type NodeWorkflowStateV4,
  type NodeWorkflowStorageV4Snapshot,
} from '@/types/node-workflow'

export const EMPTY_NODE_WORKFLOW_STATE_V4: NodeWorkflowStateV4 = {
  version: 4,
  nodes: [],
  edges: [],
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

/** 保存冲突那条常驻提示的 id 前缀（按项目一条，重复叫只刷新不叠加）。 */
const CONFLICT_TOAST_ID_PREFIX = 'node-workflow-conflict:'

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

/** 这个项目为什么只读。`null` = 可写。 */
export const NODE_WORKFLOW_READ_ONLY_REASONS = {
  /** v3 原件备份失败 —— ⛔ 不升级、不写。 */
  backupFailed: 'backupFailed',
  /** state 坏到迁移不出来 —— 报错可见，⛔ 不兜空覆盖。 */
  migrationFailed: 'migrationFailed',
  /**
   * v3 记录**还没轮到升级**：用户没打开它，所以我们既没备份也没写。
   *
   * ⚠ 与 `backupFailed` 分开是因为它不是故障：备份是**打开项目那一刻**才做的
   * （见 `switchProject`）。此前 hydration 会把账号下每一个 v3 项目都发一次备份
   * 请求，30 个项目撞上 10/分钟的限流 → 二十来个项目被误判成「备份失败」并置只读，
   * 连当前打开的 v4 项目也跟着吃一条「画布暂时只读」的 toast。
   */
  pendingUpgrade: 'pendingUpgrade',
  /**
   * 保存冲突（owner 2026-09-28）：这个项目在别处（另一个标签页 / 另一台设备）
   * 已经存过更新的版本，这边手里这份是旧的。⛔ 不再自动写回（那就是静默覆盖）；
   * 常驻提示让用户二选一：载入最新 / 另存为副本。
   */
  conflict: 'conflict',
} as const

export type NodeWorkflowReadOnlyReason =
  (typeof NODE_WORKFLOW_READ_ONLY_REASONS)[keyof typeof NODE_WORKFLOW_READ_ONLY_REASONS]

let fallbackIdSequence = 0

export function createWorkflowId(prefix: string): string {
  const randomId = globalThis.crypto?.randomUUID?.()
  if (randomId) {
    return `${prefix}-${randomId}`
  }

  fallbackIdSequence += 1
  return `${prefix}-${Date.now()}-${fallbackIdSequence}`
}

export function createWorkflowTimestamp(): string {
  return new Date().toISOString()
}

export function normalizeProjectName(
  name: string,
  fallbackName: string,
): string {
  const trimmedName = name.trim()
  const trimmedFallback = fallbackName.trim()
  const resolvedName =
    trimmedName || trimmedFallback || NODE_STUDIO_PROJECTS.fallbackName

  return resolvedName.slice(0, NODE_STUDIO_PROJECTS.nameMaxLength)
}

function createWorkflowProject(
  name: string,
  state: NodeWorkflowStateV4,
  timestamp = createWorkflowTimestamp(),
): NodeWorkflowProjectV4 {
  return {
    id: createWorkflowId(NODE_STUDIO_ID_PREFIXES.project),
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
    state,
  }
}

function createWorkflowStorageFromProject(
  project: NodeWorkflowProjectV4,
  ownerClerkId: string,
): NodeWorkflowStorageV4Snapshot {
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
): NodeWorkflowStorageV4Snapshot {
  return createWorkflowStorageFromProject(
    createWorkflowProject(
      normalizeProjectName(defaultProjectName, defaultProjectName),
      EMPTY_NODE_WORKFLOW_STATE_V4,
    ),
    ownerClerkId,
  )
}

export function getCurrentProject(
  storage: NodeWorkflowStorageV4Snapshot,
  defaultProjectName: string,
): NodeWorkflowProjectV4 {
  const currentProject =
    storage.projects.find(
      (project) => project.id === storage.currentProjectId,
    ) ?? storage.projects[0]

  if (currentProject) {
    return currentProject
  }

  return createWorkflowProject(
    normalizeProjectName(defaultProjectName, defaultProjectName),
    EMPTY_NODE_WORKFLOW_STATE_V4,
  )
}

function getProjectSummaries(
  projects: NodeWorkflowProjectV4[],
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
  storage: NodeWorkflowStorageV4Snapshot,
  defaultProjectName: string,
  updater: (currentState: NodeWorkflowStateV4) => NodeWorkflowStateV4,
): NodeWorkflowStorageV4Snapshot {
  const currentProject = getCurrentProject(storage, defaultProjectName)
  const updatedAt = createWorkflowTimestamp()
  const nextProjects = storage.projects.map((project) =>
    project.id === currentProject.id
      ? { ...project, updatedAt, state: updater(project.state) }
      : project,
  )

  if (nextProjects.length > 0) {
    return {
      ...storage,
      currentProjectId: currentProject.id,
      projects: nextProjects,
    }
  }

  return createWorkflowStorageFromProject(
    createWorkflowProject(
      normalizeProjectName(defaultProjectName, defaultProjectName),
      updater(EMPTY_NODE_WORKFLOW_STATE_V4),
      updatedAt,
    ),
    storage.ownerClerkId,
  )
}

/**
 * One composition point for every post-parse **v3** migration. Runs before
 * the v3 → v4 upgrade so retired planner / fused / legacy-role nodes are
 * already normalised when the v4 mapping reads them.
 */
function migrateLegacyV3State(state: NodeWorkflowState): NodeWorkflowState {
  return migrateVoiceClip(
    migrateRetireFusedNodes(migrateImageRoles(migrateRetirePlanner(state))),
  )
}

interface UpgradedProject {
  readonly project: NodeWorkflowProjectV4
  readonly readOnly: NodeWorkflowReadOnlyReason | null
  /** 升级前的 v3 原件 —— v3 投影视图靠它带回 v4 没有落点的字段（③d 删）。 */
  readonly originV3?: NodeWorkflowState
  readonly backupKey?: string
}

function isV4State(state: unknown): state is NodeWorkflowStateV4 {
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as { version?: unknown }).version === 4
  )
}

/**
 * 一条服务端记录 → 内存里的 v4 项目。⚠ v3 记录**先备份再升级**，备份失败即只读。
 */
async function upgradeServerRecord(
  record: NodeWorkflowProjectRecord,
  options: { readonly backupAllowed: boolean },
): Promise<UpgradedProject> {
  const base = {
    id: record.id,
    name: record.name,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }

  const originV3 = isV4State(record.state)
    ? undefined
    : migrateLegacyV3State(record.state as NodeWorkflowState)

  const result = await upgradeNodeWorkflowStateToV4({
    projectId: record.id,
    rawState: originV3 ?? record.state,
    // ⛔ 没打开的 v3 项目不发备份请求：它此刻既不会被渲染也不会被写回，备份
    // 留到 `switchProject` 真的打开它那一刻。返回 null = 「没备份」，升级函数
    // 会给出可渲染的 v4 视图但 `canPersist: false`。
    backup: async (projectId) => {
      if (!options.backupAllowed) return null
      const response = await backupNodeWorkflowV3StateAPI(
        projectId,
        'v3 -> v4 client upgrade',
      )
      return response.success && response.data
        ? { key: response.data.key }
        : null
    },
  })

  if (!result.state) {
    logger.error('[node-workflow] project state could not be upgraded to v4', {
      projectId: record.id,
      outcome: result.outcome,
      error: result.error,
    })
    return {
      project: { ...base, state: EMPTY_NODE_WORKFLOW_STATE_V4 },
      readOnly: NODE_WORKFLOW_READ_ONLY_REASONS.migrationFailed,
    }
  }

  return {
    project: { ...base, state: result.state },
    readOnly: result.canPersist
      ? null
      : options.backupAllowed
        ? NODE_WORKFLOW_READ_ONLY_REASONS.backupFailed
        : NODE_WORKFLOW_READ_ONLY_REASONS.pendingUpgrade,
    ...(originV3 ? { originV3 } : {}),
    ...(result.backupKey ? { backupKey: result.backupKey } : {}),
  }
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
 * 本地暂存的读端。⚠ 先试 v4 那份快照，不中再试 v3 / v2 / 单 state 三条 legacy
 * 路径并**在内存里迁到 v4**（本地缓存不是事实源，服务端那份才是 —— 所以这条路
 * ⛔ 不打备份接口：库里的 v3 原件一个字都没动，没有东西需要保险）。
 */
function readWorkflowStorageFromStorage(
  defaultProjectName: string,
  clerkId: string,
): {
  storage: NodeWorkflowStorageV4Snapshot
  originV3: Map<string, NodeWorkflowState>
} {
  const originV3 = new Map<string, NodeWorkflowState>()
  const fallback = () => ({
    storage: createDefaultWorkflowStorage(defaultProjectName, clerkId),
    originV3,
  })

  if (typeof window === 'undefined') return fallback()

  const fromLegacyProjects = (
    currentProjectId: string,
    projects: readonly {
      id: string
      name: string
      createdAt: string
      updatedAt: string
      state: NodeWorkflowState
    }[],
  ) => ({
    storage: {
      version: NODE_STUDIO_WORKFLOW_STORAGE.version,
      ownerClerkId: clerkId,
      currentProjectId,
      projects: projects.map((project) => {
        const migrated = migrateLegacyV3State(project.state)
        originV3.set(project.id, migrated)
        return {
          ...project,
          state: migrateLocalV3ToV4(project.id, migrated),
        }
      }),
    } satisfies NodeWorkflowStorageV4Snapshot,
    originV3,
  })

  try {
    const raw = window.localStorage.getItem(
      getNodeStudioWorkflowStorageKey(clerkId),
    )
    if (!raw) return fallback()

    const parsedJson = JSON.parse(raw) as unknown

    const parsedV4 = NodeWorkflowStorageV4Schema.safeParse(parsedJson)
    if (parsedV4.success) {
      // Belt-and-suspenders: the per-user storage key already isolates
      // slots, but if a snapshot somehow lands in the wrong key we still
      // refuse to hydrate it.
      if (parsedV4.data.ownerClerkId !== clerkId) return fallback()
      const hasCurrent = parsedV4.data.projects.some(
        (project) => project.id === parsedV4.data.currentProjectId,
      )
      if (!hasCurrent) return fallback()
      return { storage: parsedV4.data, originV3 }
    }

    const parsedStorage = NodeWorkflowStorageSchema.safeParse(parsedJson)
    if (parsedStorage.success) {
      if (parsedStorage.data.ownerClerkId !== clerkId) return fallback()
      return fromLegacyProjects(
        parsedStorage.data.currentProjectId,
        parsedStorage.data.projects,
      )
    }

    // v2 snapshots (no ownerClerkId) are accepted only because they live
    // in the per-user key — there's no cross-account ambiguity.
    const parsedLegacyV2Storage =
      NodeWorkflowLegacyV2StorageSchema.safeParse(parsedJson)
    if (parsedLegacyV2Storage.success) {
      return fromLegacyProjects(
        parsedLegacyV2Storage.data.currentProjectId,
        parsedLegacyV2Storage.data.projects,
      )
    }

    const parsedLegacyState = NodeWorkflowStateSchema.safeParse(parsedJson)
    if (parsedLegacyState.success) {
      const timestamp = createWorkflowTimestamp()
      const id = createWorkflowId(NODE_STUDIO_ID_PREFIXES.project)
      return fromLegacyProjects(id, [
        {
          id,
          name: normalizeProjectName(defaultProjectName, defaultProjectName),
          createdAt: timestamp,
          updatedAt: timestamp,
          state: {
            nodes: parsedLegacyState.data.nodes,
            edges: parsedLegacyState.data.edges,
          } as NodeWorkflowState,
        },
      ])
    }

    return fallback()
  } catch {
    return fallback()
  }
}

/**
 * 本地缓存里的 v3 → v4。⛔ 不备份（见 `readWorkflowStorageFromStorage` 的头注），
 * 迁不动就退回空图 —— 服务端水化紧接着会把真副本换上来。
 */
function migrateLocalV3ToV4(
  projectId: string,
  state: NodeWorkflowState,
): NodeWorkflowStateV4 {
  try {
    // 同一份映射（`node-workflow-migrate-v4`），只是这条路不需要备份门。
    return migrateNodeWorkflowStateToV4(state as unknown as V3State).state
  } catch (error) {
    logger.error('[node-workflow] local cache v3 → v4 failed', {
      projectId,
      error: error instanceof Error ? error.message : String(error),
    })
    return EMPTY_NODE_WORKFLOW_STATE_V4
  }
}

/**
 * Persist the whole snapshot (every project, full state) under this user's
 * scoped key.
 *
 * ⚠ This write grows without bound: `MAX_PROJECTS_PER_USER` is 50, a
 * 40-node project serializes to ~70 KB, and Chromium bills localStorage in
 * UTF-16 code units — so a heavy account can walk into the ~5 MB ceiling.
 * When that happens the browser throws and **local persistence simply stops**.
 * The server copy is authoritative, so nothing is lost, but the user must be
 * told — this used to be a bare `catch { return }` and the failure was
 * invisible.
 */
function writeWorkflowStorageToStorage(
  storage: NodeWorkflowStorageV4Snapshot,
  clerkId: string,
): WorkflowStorageWriteOutcome {
  if (typeof window === 'undefined') {
    return WORKFLOW_STORAGE_WRITE_OUTCOMES.skipped
  }

  // Refuse to persist a snapshot whose owner doesn't match the active
  // session — that means we're mid-account-switch and the in-memory
  // state is still the previous user's.
  if (storage.ownerClerkId !== clerkId) {
    return WORKFLOW_STORAGE_WRITE_OUTCOMES.skipped
  }

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
      snapshotChars: serialized.length,
    })
    return quotaExceeded
      ? WORKFLOW_STORAGE_WRITE_OUTCOMES.quotaExceeded
      : WORKFLOW_STORAGE_WRITE_OUTCOMES.failed
  }
}

/**
 * One-shot cleanup of the pre-v3 global key. v2 and earlier stored every
 * account's workflows under the same un-scoped localStorage slot.
 */
function purgeLegacyGlobalStorage(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(NODE_STUDIO_WORKFLOW_STORAGE.legacyGlobalKey)
  } catch {
    // ignore
  }
}

export interface UseNodeWorkflowStoreOptions {
  defaultProjectName: string
  /** Clerk user id; `null` parks the store (no storage reads, no API calls). */
  clerkId: string | null
}

export interface NodeWorkflowStoreValue {
  /** True only after both local and server hydration finish for this user. */
  isHydrated: boolean
  storageRef: React.RefObject<NodeWorkflowStorageV4Snapshot>
  currentProject: NodeWorkflowProjectV4
  /** ⚠ 事实形状。v3 引擎拿到的是它的投影。 */
  state: NodeWorkflowStateV4
  projects: NodeWorkflowProjectSummary[]
  /** 当前项目为什么只读；`null` = 可写。 */
  readOnlyReason: NodeWorkflowReadOnlyReason | null
  /** 有写入正在发往服务端（项目胶囊那颗保存点）。 */
  isSaving: boolean
  /**
   * 「载入最新」换过几次内容。图引擎撤销栈的 `historyKey` 带上它：换进来的这份
   * 不是从上一份改出来的，旧的撤销记录一条都不能用。
   */
  stateEpoch: number
  /** 升级前的 v3 原件（按项目）。v3 投影视图靠它带回 v4 没有落点的字段。 */
  originV3Ref: React.RefObject<Map<string, NodeWorkflowState>>
  /** ⚠ 当前项目 state 的**唯一**写入口。返回写完之后的 v4。 */
  commitCurrentProjectState(
    updater: (currentState: NodeWorkflowStateV4) => NodeWorkflowStateV4,
  ): NodeWorkflowStateV4
  createProject(name: string): string
  /**
   * 复制一个项目（S7 项目胶囊的 ⋯）。返回新项目 id；源项目不存在时回 `null`。
   *
   * ⚠ 与 `createProject` 走**同一条**建行路径（本地先建 → `createProjectOnServer`
   * 登记 id），差别只在初始 state 是源项目那一份的深拷贝，⛔ 不新造第二条建行。
   */
  duplicateProject(id: string, name: string): string | null
  switchProject(id: string): void
  renameCurrentProject(name: string): void
  deleteProject(id: string): NodeWorkflowProjectSummary | null
  saveNow(): Promise<boolean>
}

export function useNodeWorkflowStore({
  defaultProjectName,
  clerkId,
}: UseNodeWorkflowStoreOptions): NodeWorkflowStoreValue {
  const tToasts = useTranslations('StudioNode.toasts')
  const tToastsRef = useRef(tToasts)
  const tShell = useTranslations('StudioNode.shell')
  const tShellRef = useRef(tShell)
  useEffect(() => {
    tToastsRef.current = tToasts
    tShellRef.current = tShell
  }, [tToasts, tShell])

  /**
   * 「本地暂存写不进去」一个会话只说一次。本地写入是 400ms 的 debounce——
   * 不抑制的话配额一满，用户每敲一下键盘就会再吃一次同样的 toast。
   */
  const hasReportedStorageWriteFailure = useRef(false)
  const reportStorageWriteOutcome = useCallback(
    (outcome: WorkflowStorageWriteOutcome) => {
      if (outcome === WORKFLOW_STORAGE_WRITE_OUTCOMES.written) return
      if (outcome === WORKFLOW_STORAGE_WRITE_OUTCOMES.skipped) return
      if (hasReportedStorageWriteFailure.current) return
      hasReportedStorageWriteFailure.current = true
      toast.error(
        tToastsRef.current(
          outcome === WORKFLOW_STORAGE_WRITE_OUTCOMES.quotaExceeded
            ? 'localCacheFull'
            : 'localCacheUnavailable',
        ),
      )
    },
    [],
  )

  const hasReportedServerWriteFailure = useRef(false)
  const reportServerWriteFailure = useCallback(
    (operation: ServerWriteOperation, error?: string, status?: number) => {
      logger.error('[node-workflow] server persist failed', {
        operation,
        error,
        status,
      })
      if (hasReportedServerWriteFailure.current) return
      hasReportedServerWriteFailure.current = true
      /**
       * 台账 V（2026-08-29 真机）：**「服务端拒收 payload」和「连不上服务端」必须
       * 说成两件事**。判据是 **4xx**，不是「有没有状态码」。
       */
      if (typeof status === 'number' && status >= 400 && status < 500) {
        toast.error(tToastsRef.current('cloudSaveRejected'), {
          description: error,
        })
        return
      }
      toast.error(tToastsRef.current('cloudSaveFailed'))
    },
    [],
  )

  const parkedStorage = useMemo(
    () =>
      createDefaultWorkflowStorage(defaultProjectName, PARKED_OWNER_CLERK_ID),
    [defaultProjectName],
  )
  const [storageState, setStorageState] =
    useState<NodeWorkflowStorageV4Snapshot>(parkedStorage)
  const [hydrationStatus, setHydrationStatus] = useState<{
    clerkId: string | null
    defaultProjectName: string
    isComplete: boolean
  }>(() => ({ clerkId, defaultProjectName, isComplete: false }))
  if (
    hydrationStatus.clerkId !== clerkId ||
    hydrationStatus.defaultProjectName !== defaultProjectName
  ) {
    setHydrationStatus({ clerkId, defaultProjectName, isComplete: false })
  }
  const storageRef = useRef<NodeWorkflowStorageV4Snapshot>(parkedStorage)
  const originV3Ref = useRef<Map<string, NodeWorkflowState>>(new Map())
  /**
   * ⚠ 只读闸。备份失败 / 迁移失败的项目**一个字都不写回服务端**——它库里那份
   * v3 原件还没有保险，覆盖了就没有退路。
   */
  const [readOnlyProjectIds, setReadOnlyProjectIds] = useState<
    Record<string, NodeWorkflowReadOnlyReason>
  >({})
  const readOnlyRef = useRef<Record<string, NodeWorkflowReadOnlyReason>>({})
  const hasReportedReadOnly = useRef(false)
  /**
   * ⚠ toast **只为用户当前打开的那个项目**发。
   *
   * 之前是「本会话只要有任何一个项目只读就报一次」，于是账号里某个久未打开的
   * v3 项目备份失败，正在编辑的 v4 项目也会弹「画布暂时只读」——用户看到的是
   * 一句与手上这张图无关、却明确说不能编辑的话。`pendingUpgrade` 更不该出声：
   * 它是「还没轮到」，不是故障。
   */
  const markReadOnly = useCallback(
    (entries: Record<string, NodeWorkflowReadOnlyReason>) => {
      if (Object.keys(entries).length === 0) return
      readOnlyRef.current = { ...readOnlyRef.current, ...entries }
      setReadOnlyProjectIds(readOnlyRef.current)
      const currentReason = entries[storageRef.current.currentProjectId]
      if (!currentReason) return
      if (currentReason === NODE_WORKFLOW_READ_ONLY_REASONS.pendingUpgrade) {
        return
      }
      // 冲突有自己那条带两个去处的提示（`reportConflict`），⛔ 不说成「备份失败」。
      if (currentReason === NODE_WORKFLOW_READ_ONLY_REASONS.conflict) return
      if (hasReportedReadOnly.current) return
      hasReportedReadOnly.current = true
      toast.error(tToastsRef.current('v3UpgradeReadOnly'))
    },
    [],
  )

  /** 只读闸解除（备份补做成功后）。 */
  const clearReadOnly = useCallback((projectId: string) => {
    if (!readOnlyRef.current[projectId]) return
    const next = { ...readOnlyRef.current }
    delete next[projectId]
    readOnlyRef.current = next
    setReadOnlyProjectIds(next)
  }, [])

  const hasHydrated = useRef(false)
  const hasPreHydrationMutation = useRef(false)
  const loadedForClerkId = useRef<string | null>(null)
  const hasServerHydrated = useRef(false)
  const hasServerMigrationAttempted = useRef(false)
  /**
   * 本会话里**服务端亲口确认存在**的项目 id。只有它们才允许被写回服务端。
   * 与 `hasServerHydrated` 各管一件事（后者在 list 失败的回落分支里也会置 true），
   * 都留着，不合并。
   */
  const serverConfirmedProjectIds = useRef<Set<string>>(new Set())
  /** 「未确认所以跳过写入」每个项目只警告一次。 */
  const warnedUnconfirmedProjectIds = useRef<Set<string>>(new Set())
  /** 「这个项目的空，是用户自己删空的」。服务端的空覆盖闸靠它放行。 */
  const locallyClearedProjectIds = useRef<Set<string>>(new Set())
  /**
   * 保存冲突保护（owner 2026-09-28）。
   * · `serverVersionRef`：每个项目这边上一次看到的服务端版本（`updatedAt` 原样，
   *   服务端只在写 state 时改它）。写回时带上，对不上服务端回 409。
   * · `syncedStateRef`：每个项目「与服务端一致」的那一份 state（按引用比）。
   *   ⚠ 内容没变就不写 —— 切到一个项目、标签页回到前台这类「什么都没改」的时刻，
   *   以前也会把这边内存里那份整份推上去，而它可能早就旧了。
   */
  const serverVersionRef = useRef<Map<string, string>>(new Map())
  const syncedStateRef = useRef<Map<string, NodeWorkflowStateV4>>(new Map())
  /** 在飞的服务端写入数（项目胶囊那颗保存点读它，⛔ 不再只看上传）。 */
  const [pendingServerWrites, setPendingServerWrites] = useState(0)
  /**
   * 「载入最新」换过几次内容。图引擎的撤销栈认它（`historyKey`）：换进来的这份
   * 不是从上一份改出来的，旧的 inverse 一条都不能再用。
   */
  const [stateEpoch, setStateEpoch] = useState(0)
  /**
   * **服务端水化之前**在本地被改过的项目 id（首屏那一小段窗口）。
   * 服务端列表回来时靠它决定「本地这份要不要顶掉服务端那份」——⛔ 不用时间戳去赌
   * 那一秒钟，见 `mergeAdoptedProjects` 头注。
   */
  const editedBeforeServerHydration = useRef<Set<string>>(new Set())

  const setWorkflowStorage = useCallback(
    (
      updater: (
        currentStorage: NodeWorkflowStorageV4Snapshot,
      ) => NodeWorkflowStorageV4Snapshot,
    ) => {
      if (!hasHydrated.current) {
        hasPreHydrationMutation.current = true
      }

      const previousStorage = storageRef.current
      const nextStorage = updater(previousStorage)

      // 记账「用户把当前项目删空了」。只看当前项目，而且只在 currentProjectId
      // 没变的那些写入里看 —— switchProject / deleteProject 会换掉它。
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

      // 首屏窗口里的改动记名：服务端列表一回来，`adoptServerProjects` 靠这份名单
      // 保住它们（⛔ 否则整份替换会把刚建的节点无声抹掉）。
      if (!hasServerHydrated.current) {
        editedBeforeServerHydration.current.add(trackedProjectId)
      }

      storageRef.current = nextStorage
      setStorageState(nextStorage)
      return nextStorage
    },
    [],
  )

  // One-shot legacy wipe — runs once per browser session regardless of
  // who's signed in.
  useEffect(() => {
    purgeLegacyGlobalStorage()
  }, [])

  // Hydrate from the per-user localStorage slot whenever clerkId changes.
  useEffect(() => {
    hasHydrated.current = false
    hasPreHydrationMutation.current = false
    hasServerHydrated.current = false
    hasServerMigrationAttempted.current = false
    // 换账号 = 换一整套项目 id。
    serverConfirmedProjectIds.current = new Set()
    warnedUnconfirmedProjectIds.current = new Set()
    locallyClearedProjectIds.current = new Set()
    editedBeforeServerHydration.current = new Set()
    originV3Ref.current = new Map()
    if (clerkId === null) {
      loadedForClerkId.current = null
    }

    let cancelled = false
    let preHydrationSaveTimeout: number | undefined

    window.queueMicrotask(() => {
      if (cancelled) return

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

      const hydrated = readWorkflowStorageFromStorage(
        defaultProjectName,
        clerkId,
      )
      originV3Ref.current = hydrated.originV3
      storageRef.current = hydrated.storage
      setStorageState(hydrated.storage)
    })

    return () => {
      cancelled = true
      if (preHydrationSaveTimeout !== undefined) {
        window.clearTimeout(preHydrationSaveTimeout)
      }
    }
  }, [clerkId, defaultProjectName, reportStorageWriteOutcome])

  useEffect(() => {
    if (!hasHydrated.current) return
    if (clerkId === null) return
    if (loadedForClerkId.current !== clerkId) return

    const timeoutId = window.setTimeout(() => {
      reportStorageWriteOutcome(
        writeWorkflowStorageToStorage(storageState, clerkId),
      )
    }, NODE_STUDIO_WORKFLOW_STORAGE.debounceMs)

    return () => window.clearTimeout(timeoutId)
  }, [clerkId, reportStorageWriteOutcome, storageState])

  // Server hydration: the server is the source of truth. v3 records are
  // upgraded here — **sequentially**, because each one may POST a backup
  // and that route is rate-limited.
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

    const adoptServerProjects = async (
      records: NodeWorkflowProjectRecord[],
    ): Promise<boolean> => {
      const projects: NodeWorkflowProjectV4[] = []
      const readOnly: Record<string, NodeWorkflowReadOnlyReason> = {}
      /** 库里本来就是 v4 的那几份：水化进来的 state 就是服务端原样。 */
      const storedAsV4 = new Set<string>()
      // 服务端按 lastActiveAt 排序，第 0 条就是马上要打开的那个项目 —— 也是
      // 本次 hydration 里**唯一**允许发备份请求的那个。
      const activeRecordId = records[0]?.id ?? null
      for (const record of records) {
        const upgraded = await upgradeServerRecord(record, {
          backupAllowed: record.id === activeRecordId,
        })
        if (cancelled) return false
        projects.push(upgraded.project)
        if (upgraded.readOnly) readOnly[record.id] = upgraded.readOnly
        if (upgraded.originV3) {
          originV3Ref.current.set(record.id, upgraded.originV3)
        } else if (!upgraded.readOnly) {
          storedAsV4.add(record.id)
        }
        serverConfirmedProjectIds.current.add(record.id)
        serverVersionRef.current.set(record.id, record.updatedAt)
      }
      // ⚠ **合并，不是替换**：首屏那一小段窗口里建的节点、以及上一次会话写了盘
      // 但没 PUT 上去的改动，都要活下来；当前项目也不许跳（`mergeAdoptedProjects`）。
      const nextStorage = mergeAdoptedProjects({
        local: storageRef.current,
        server: projects,
        ownerClerkId: clerkId,
        editedBeforeHydration: editedBeforeServerHydration.current,
        readOnlyIds: new Set(Object.keys(readOnly)),
      })
      // 合并之后仍是服务端那一份的项目 = 与服务端一致：不改就不写回。本地那份
      // 胜出的（首屏窗口里改过 / 本地更新）不记，下一次写入照常把它推上去。
      for (const project of projects) {
        if (!storedAsV4.has(project.id)) continue
        const kept = nextStorage.projects.find((item) => item.id === project.id)
        if (kept?.state === project.state) {
          syncedStateRef.current.set(project.id, project.state)
        }
      }
      storageRef.current = nextStorage
      setStorageState(nextStorage)
      markReadOnly(readOnly)
      return true
    }

    void (async () => {
      const response = await listNodeWorkflowProjectsAPI()
      if (cancelled) return

      // Network or auth failure — silently fall back to localStorage so the
      // user keeps editing offline.
      if (!response.success || !response.data) {
        completeHydration()
        return
      }

      const serverProjects = response.data
      const localSnapshot = storageRef.current

      if (serverProjects.length > 0) {
        await adoptServerProjects(serverProjects)
        completeHydration()
        return
      }

      // Server is empty. Migration is only safe when the local snapshot is
      // provably owned by the user currently signed in.
      if (localSnapshot.ownerClerkId !== clerkId) {
        completeHydration()
        return
      }

      if (!hasServerMigrationAttempted.current) {
        hasServerMigrationAttempted.current = true
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
              created.status,
            )
            break
          }
        }

        // ⚠ 只在**整批**都上去了之后才做下面那步替换。
        if (!migrationFailed) {
          const refetch = await listNodeWorkflowProjectsAPI()
          if (cancelled) return
          if (refetch.success && refetch.data && refetch.data.length > 0) {
            await adoptServerProjects(refetch.data)
          }
        }
      }

      completeHydration()
    })()

    return () => {
      cancelled = true
    }
  }, [
    clerkId,
    defaultProjectName,
    markReadOnly,
    reportServerWriteFailure,
    storageState,
  ])

  /**
   * 409 之后怎么办 —— 实现在 `duplicateProject` 之后（「另存为副本」要用它），
   * 写入路径只认这个口。
   */
  const onConflictRef = useRef<(projectId: string) => void>(() => {})
  /**
   * 同一个项目的写入**排队**：上一枪回来、版本号更新了，下一枪才出发。
   * ⚠ 不排队的话，一次超过 5s 的慢请求还在路上时，下一次防抖写入会带着旧版本号
   *   出发，被自己刚写进去的那一版判成冲突。
   */
  const writeChainRef = useRef<Map<string, Promise<boolean>>>(new Map())

  /**
   * 把一个项目的 state 写回服务端 —— 自动保存与「立即保存」共用这一条（⛔ 不留第二条
   * 不带版本号的写法）。成功：记下新版本与这一份 state；409：别处改过 → 停写、让用户选。
   */
  const pushProjectState = useCallback(
    (projectId: string, state: NodeWorkflowStateV4): Promise<boolean> => {
      const send = async (): Promise<boolean> => {
        // 排队期间可能已经判了冲突 / 只读：⛔ 那之后一个字都不写。
        if (readOnlyRef.current[projectId]) return false
        const baseUpdatedAt = serverVersionRef.current.get(projectId)
        setPendingServerWrites((count) => count + 1)
        try {
          const response = await updateNodeWorkflowProjectAPI(projectId, {
            state,
            allowEmptyState: locallyClearedProjectIds.current.has(projectId),
            ...(baseUpdatedAt ? { baseUpdatedAt } : {}),
          })
          if (response.success) {
            if (response.data) {
              serverVersionRef.current.set(projectId, response.data.updatedAt)
            }
            syncedStateRef.current.set(projectId, state)
            return true
          }
          if (response.status === 409) {
            onConflictRef.current(projectId)
            return false
          }
          reportServerWriteFailure(
            SERVER_WRITE_OPERATIONS.update,
            response.error,
            response.status,
          )
          return false
        } finally {
          setPendingServerWrites((count) => count - 1)
        }
      }
      const previous = writeChainRef.current.get(projectId)
      const next = previous ? previous.then(send, send) : send()
      writeChainRef.current.set(projectId, next)
      return next
    },
    [reportServerWriteFailure],
  )

  // Debounced server write — pushes the CURRENT project's state up every
  // ~5s of inactivity.
  useEffect(() => {
    if (clerkId === null) return
    if (!hasServerHydrated.current) return
    if (storageState.ownerClerkId !== clerkId) return

    const currentId = storageState.currentProjectId
    const current = storageState.projects.find((p) => p.id === currentId)
    if (!current) return

    // 冲突了还在改：提示要看得见（同一个 id，只会刷新那一条，不会刷屏）。
    if (
      readOnlyRef.current[currentId] ===
        NODE_WORKFLOW_READ_ONLY_REASONS.conflict &&
      current.state !== syncedStateRef.current.get(currentId)
    ) {
      onConflictRef.current(currentId)
      return
    }
    // ⛔ 备份没成功的项目一个字都不写回去。
    if (readOnlyRef.current[currentId]) return

    // 内容没变就不写：切到一个项目、标签页回到前台这类「什么都没改」的时刻，
    // ⛔ 不再把这边内存里那份（可能早就旧了）整份推上去。
    if (syncedStateRef.current.get(currentId) === current.state) return

    // ⚠ 覆写链的客户端这一头：只有服务端本会话亲口确认过的项目才允许被写回去。
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
      void pushProjectState(currentId, current.state)
    }, SERVER_WRITE_DEBOUNCE_MS)

    return () => window.clearTimeout(timeoutId)
  }, [clerkId, pushProjectState, readOnlyProjectIds, storageState])

  const currentProject = useMemo(
    () => getCurrentProject(storageState, defaultProjectName),
    [defaultProjectName, storageState],
  )
  const isHydrated =
    clerkId !== null &&
    hydrationStatus.clerkId === clerkId &&
    hydrationStatus.defaultProjectName === defaultProjectName &&
    hydrationStatus.isComplete
  const projects = useMemo(
    () => getProjectSummaries(storageState.projects),
    [storageState.projects],
  )

  const commitCurrentProjectState = useCallback(
    (updater: (currentState: NodeWorkflowStateV4) => NodeWorkflowStateV4) => {
      const next = setWorkflowStorage((currentStorage) =>
        patchCurrentProjectState(currentStorage, defaultProjectName, updater),
      )
      return getCurrentProject(next, defaultProjectName).state
    },
    [defaultProjectName, setWorkflowStorage],
  )

  // Gate every server-side effect on (a) Clerk having loaded a user and
  // (b) the in-memory storage already belonging to that user.
  const canCallServerNow = useCallback(() => {
    if (clerkId === null) return false
    if (!hasServerHydrated.current) return false
    if (storageRef.current.ownerClerkId !== clerkId) return false
    return true
  }, [clerkId])

  /**
   * 给一个刚在本地建出来的项目在服务端建行。**每一条「本地凭空多出一个项目」
   * 的路径都必须走这里**。⚠ 登记 `serverConfirmedProjectIds` 是最要紧的一步。
   */
  const createProjectOnServer = useCallback(
    (project: NodeWorkflowProjectV4) => {
      void createNodeWorkflowProjectAPI({
        name: project.name,
        state: project.state,
      }).then((response) => {
        if (!response.success || !response.data) {
          reportServerWriteFailure(
            SERVER_WRITE_OPERATIONS.create,
            response.error,
            response.status,
          )
          return
        }

        const serverId = response.data.id
        serverConfirmedProjectIds.current.add(serverId)
        serverVersionRef.current.set(serverId, response.data.updatedAt)
        syncedStateRef.current.set(serverId, project.state)
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
      const project = createWorkflowProject(
        normalizeProjectName(name, defaultProjectName),
        EMPTY_NODE_WORKFLOW_STATE_V4,
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

  const duplicateProject = useCallback(
    (id: string, name: string): string | null => {
      const source = storageRef.current.projects.find(
        (project) => project.id === id,
      )
      if (!source) return null
      // 结构化克隆：新项目与源项目**不共享**任何数组/对象，⛔ 不浅拷一层了事
      // （浅拷之后在新项目里挪一张卡会连源项目一起挪）。
      const project = createWorkflowProject(
        normalizeProjectName(name, source.name),
        structuredClone(source.state),
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
    [canCallServerNow, createProjectOnServer, setWorkflowStorage],
  )

  /**
   * 「载入最新」：把服务端那一份原样换进来，这边没存上的改动放弃（用户选的）。
   * ⚠ 换进来的不是从手上这份改出来的 —— `stateEpoch` +1，图引擎据此清空撤销栈。
   */
  const loadLatestFromServer = useCallback(
    async (projectId: string): Promise<boolean> => {
      const response = await getNodeWorkflowProjectAPI(projectId)
      if (!response.success || !response.data) {
        toast.error(tToastsRef.current('conflictLoadFailed'))
        return false
      }
      const record = response.data
      const upgraded = await upgradeServerRecord(record, {
        backupAllowed: false,
      })
      // 库里那份不是能直接用的 v4（v3 / 读不出来）：⛔ 不猜，保持只读。
      if (upgraded.readOnly) {
        markReadOnly({ [projectId]: upgraded.readOnly })
        return false
      }
      setWorkflowStorage((currentStorage) => ({
        ...currentStorage,
        projects: currentStorage.projects.map((project) =>
          project.id === projectId ? upgraded.project : project,
        ),
      }))
      serverVersionRef.current.set(projectId, record.updatedAt)
      syncedStateRef.current.set(projectId, upgraded.project.state)
      clearReadOnly(projectId)
      toast.dismiss(`${CONFLICT_TOAST_ID_PREFIX}${projectId}`)
      setStateEpoch((epoch) => epoch + 1)
      return true
    },
    [clearReadOnly, markReadOnly, setWorkflowStorage],
  )

  /**
   * 「另存为副本」：这边手上这份存成一个新项目（⛔ 不碰别处存的那一版），并切过去
   * 接着改；原项目随后换回服务端那一份，下次打开看到的就是最新的。
   */
  const saveConflictAsCopy = useCallback(
    (projectId: string) => {
      const source = storageRef.current.projects.find(
        (project) => project.id === projectId,
      )
      if (!source) return
      const copyId = duplicateProject(
        projectId,
        tShellRef.current('project.duplicateSuffix', { name: source.name }),
      )
      if (!copyId) return
      toast.dismiss(`${CONFLICT_TOAST_ID_PREFIX}${projectId}`)
      void loadLatestFromServer(projectId)
    },
    [duplicateProject, loadLatestFromServer],
  )

  /**
   * 409：这个项目别处存过更新的版本。停写（只读闸），并给一句话 + 两个去处。
   * 同一个 id 的提示只会刷新那一条；⚠ 不是当前项目就先不出声，切回来、或者在它上
   * 面继续改时再说（写入口那一处会再叫一次）。
   */
  const reportConflict = useCallback(
    (projectId: string) => {
      if (
        readOnlyRef.current[projectId] !==
        NODE_WORKFLOW_READ_ONLY_REASONS.conflict
      ) {
        logger.warn('[node-workflow] save conflict: changed elsewhere', {
          projectId,
        })
        markReadOnly({ [projectId]: NODE_WORKFLOW_READ_ONLY_REASONS.conflict })
      }
      if (storageRef.current.currentProjectId !== projectId) return
      toast.warning(tToastsRef.current('conflict'), {
        id: `${CONFLICT_TOAST_ID_PREFIX}${projectId}`,
        duration: Number.POSITIVE_INFINITY,
        action: {
          label: tToastsRef.current('conflictLoadLatest'),
          onClick: () => void loadLatestFromServer(projectId),
        },
        cancel: {
          label: tToastsRef.current('conflictSaveAsCopy'),
          onClick: () => saveConflictAsCopy(projectId),
        },
      })
    },
    [loadLatestFromServer, markReadOnly, saveConflictAsCopy],
  )
  useEffect(() => {
    onConflictRef.current = reportConflict
  }, [reportConflict])

  /**
   * 补做一个 `pendingUpgrade` 项目的 v3 备份 —— 「打开它」就是升级的触发点。
   * 备份成功 → 解闸，这个项目从此按 v4 正常读写；失败 → 升级成 `backupFailed`
   * 并让用户看见（它现在**是**当前项目，toast 说的就是手上这张图）。
   */
  const ensureBackupBeforeEditing = useCallback(
    (id: string) => {
      if (
        readOnlyRef.current[id] !==
        NODE_WORKFLOW_READ_ONLY_REASONS.pendingUpgrade
      ) {
        return
      }
      // ⛔ 服务端还没确认过身份就别发：那一发失败会把「还没轮到」误升级成
      // 「备份失败」，用户下次打开这个项目就永远只读了。
      if (!canCallServerNow()) return
      void backupNodeWorkflowV3StateAPI(id, 'v3 -> v4 client upgrade').then(
        (response) => {
          if (response.success && response.data) {
            clearReadOnly(id)
            return
          }
          markReadOnly({
            [id]: NODE_WORKFLOW_READ_ONLY_REASONS.backupFailed,
          })
        },
      )
    },
    [canCallServerNow, clearReadOnly, markReadOnly],
  )

  const switchProject = useCallback(
    (id: string) => {
      setWorkflowStorage((currentStorage) =>
        currentStorage.projects.some((project) => project.id === id)
          ? { ...currentStorage, currentProjectId: id }
          : currentStorage,
      )
      ensureBackupBeforeEditing(id)

      // Bump server lastActiveAt so reopening this account on another
      // device lands on the just-switched-to project.
      if (canCallServerNow()) {
        // ⚠ 只记日志，**不弹 toast**，也**不共用**内容写入那个一次性抑制标志：
        // activate 失败丢的只是「下次默认开哪个项目」这个指针。
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
    [canCallServerNow, ensureBackupBeforeEditing, setWorkflowStorage],
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
              ? { ...project, name: normalizedName, updatedAt }
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
              response.status,
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
      if (!targetProject) return null

      const remainingProjects = snapshot.projects.filter(
        (project) => project.id !== id,
      )

      // 删掉最后一个项目时本地立刻补一个空项目顶上。它必须**在这里**先建出来，
      // 好走下面 `createProjectOnServer` 那条建行 + 登记 id 的路。
      const replacementProject =
        remainingProjects.length === 0
          ? createWorkflowProject(
              normalizeProjectName(defaultProjectName, defaultProjectName),
              EMPTY_NODE_WORKFLOW_STATE_V4,
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
      originV3Ref.current.delete(id)

      if (canCallServerNow()) {
        void deleteNodeWorkflowProjectAPI(id).then((response) => {
          if (!response.success) {
            reportServerWriteFailure(
              SERVER_WRITE_OPERATIONS.delete,
              response.error,
              response.status,
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

  const saveNow = useCallback(async (): Promise<boolean> => {
    if (!canCallServerNow()) return false
    const snapshot = storageRef.current
    const currentId = snapshot.currentProjectId
    const current = snapshot.projects.find((p) => p.id === currentId)
    if (!current) return false
    // ⛔ 备份没成功 = 不写。手动点的也一样。
    if (readOnlyRef.current[currentId]) {
      logger.warn('[node-workflow] skipped manual save: project is read-only', {
        projectId: currentId,
        reason: readOnlyRef.current[currentId],
      })
      return false
    }
    // 手动保存走同一条闸：服务端水化失败时用户手里这份 state 同样来路不明。
    if (!serverConfirmedProjectIds.current.has(currentId)) {
      logger.warn(
        '[node-workflow] skipped manual save: project not confirmed by the server this session',
        { projectId: currentId },
      )
      return false
    }
    // 与自动保存同一条：带版本号、排队、冲突停写（⛔ 手动点的不能绕过冲突保护）。
    return pushProjectState(currentId, current.state)
  }, [canCallServerNow, pushProjectState])

  return useMemo(
    () => ({
      isHydrated,
      storageRef,
      currentProject,
      state: currentProject.state,
      projects,
      readOnlyReason: readOnlyProjectIds[currentProject.id] ?? null,
      isSaving: pendingServerWrites > 0,
      stateEpoch,
      originV3Ref,
      commitCurrentProjectState,
      createProject,
      duplicateProject,
      switchProject,
      renameCurrentProject,
      deleteProject,
      saveNow,
    }),
    [
      commitCurrentProjectState,
      createProject,
      currentProject,
      deleteProject,
      duplicateProject,
      isHydrated,
      pendingServerWrites,
      projects,
      readOnlyProjectIds,
      renameCurrentProject,
      saveNow,
      stateEpoch,
      switchProject,
    ],
  )
}
