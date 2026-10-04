'use client'

/**
 * 会话历史的**落库与载回**（P4-B，拍板 10）。
 *
 * ── 复用的是哪条写入路径 ──────────────────────────────────────────
 * `POST /api/assistant/conversation` → `assistant-conversation.service.ts` ——
 * 与画布助手（`use-assistant-conversation.ts`）**同一条**，零新增路由、零迁移。
 * 表是既有的 `AssistantConversation`，操作员的痕迹搭在每条消息的可选 `operator`
 * 格上（形态与 `promptDraft` / `loraPicks` 那几格一模一样）。
 *
 * 会话按账号、工作区和画布项目隔离；surface 只保留原有存储分类。
 *
 * ── 存什么 / 不存什么 ─────────────────────────────────────────────
 * 只存**可读历史**。撤销的 inverse、primed、就地确认条、改动登记簿、联网候选的
 * 「选用」钮、在飞上传 —— 一个都不存，因为它们是**对当前表单的控制权**，而重新
 * 加载之后表单早就不是当时那张（画布那边的原话：「一条几分钟前针对另一张图的
 * 提案，重新加载后再点应用只会做错事」）。结构上的保证见
 * `types/studio-operator-history.ts`：那个类型装不下 inverse。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

import { STUDIO_OPERATOR_HISTORY } from '@/constants/studio-assistant-operator'
import type { AssistantWorkspace } from '@/types/assistant-workspace'
import {
  assistantWorkspaceDomain,
  assistantWorkspaceKey,
  assistantWorkspaceScope,
  assistantWorkspaceSurface,
} from '@/lib/assistant-workspace'
import {
  renameAssistantConversationAPI,
  deleteAssistantConversationAPI,
  getAssistantConversationAPI,
  listAssistantConversationsAPI,
  upsertAssistantConversationAPI,
} from '@/lib/api-client'
import { logger } from '@/lib/logger'
import {
  fromStoredOperatorMessages,
  pendingFromOperatorState,
  pendingFromStoredMessages,
  toOperatorHistory,
  toStoredOperatorMessages,
} from '@/lib/studio-operator-history'
import {
  claimOperatorThreadScope,
  getOperatorState,
  getOperatorThread,
  loadOperatorThread,
  resetOperatorThread,
  setOperatorSession,
  setOperatorSaveFailed,
  useStudioOperatorState,
  type StudioOperatorState,
} from '@/hooks/use-studio-operator-store'
import {
  type AssistantConversationSummary,
  type AssistantSurfaceId,
} from '@/types/assistant-conversation'

/**
 * 这次页面加载里哪些会话作用域水化过了（D12 U7：工作台一份、每个画布项目各一份）。
 *
 * ⚠ 模块级而不是 ref：`StudioOperatorDock` 会随路由在图片 / 视频之间重挂，而
 * 「载回最近一条」是**每个作用域每次页面加载一次**的事。用 ref 的下场是每次重挂
 * 都去覆盖一遍当前线程 —— 用户刚说了两句话，切个模态全没了。
 */
const hydratedScopes = new Set<string>()
let activeUserId: string | null = null
let activeWorkspace: WorkspacePersistence | null = null
const removedSessionIds = new Set<string>()

interface WorkspacePersistence {
  userId: string
  scope: string
  workspaceKey: string
  surface: AssistantSurfaceId
  projectId?: string
}

interface ThreadSave extends WorkspacePersistence {
  snapshot: StudioOperatorState
}

const savedThreads = new Map<string, ThreadSave>()
const pendingSaves = new Map<
  string,
  {
    latest: ThreadSave
    next: ThreadSave | null
    promise: Promise<boolean>
  }
>()

function sameSavedContent(
  left: ThreadSave | undefined,
  right: ThreadSave,
): boolean {
  return Boolean(
    left &&
    left.snapshot.entries === right.snapshot.entries &&
    left.snapshot.history === right.snapshot.history &&
    left.snapshot.question === right.snapshot.question &&
    left.snapshot.confirm === right.snapshot.confirm,
  )
}

function persistThread(request: ThreadSave): Promise<boolean> {
  const id = request.snapshot.localThreadId
  const existing = pendingSaves.get(id)
  if (existing) {
    if (!sameSavedContent(existing.latest, request)) {
      existing.latest = request
      existing.next = request
    }
    return existing.promise
  }
  if (sameSavedContent(savedThreads.get(id), request))
    return Promise.resolve(true)
  const queue = {
    latest: request,
    next: request as ThreadSave | null,
    promise: Promise.resolve(false),
  }
  pendingSaves.set(id, queue)
  queue.promise = (async () => {
    let sessionId = request.snapshot.sessionId
    let saved = false
    while (queue.next) {
      const current = queue.next
      queue.next = null
      if (activeUserId !== current.userId) continue
      if (sessionId && removedSessionIds.has(sessionId)) continue
      const history = [
        ...current.snapshot.history,
        ...toOperatorHistory(current.snapshot.entries),
      ]
      if (history.length === 0) continue
      const result = await upsertAssistantConversationAPI({
        ...(sessionId ? { id: sessionId } : {}),
        surface: current.surface,
        workspaceKey: current.workspaceKey,
        ...(current.projectId ? { projectId: current.projectId } : {}),
        messages: toStoredOperatorMessages(
          history,
          pendingFromOperatorState(
            current.snapshot.question,
            current.snapshot.confirm,
          ),
        ),
      })
      if (sessionId && removedSessionIds.has(sessionId)) continue
      const identity = { threadScope: current.scope, localThreadId: id }
      if (!result.success) {
        saved = false
        logger.warn('[studio-operator-history] persist failed', {
          error: result.error,
          errorCode: result.errorCode,
        })
        if (result.errorCode === 'ASSISTANT_CONVERSATION_NOT_FOUND') {
          setOperatorSession(null, null, identity)
        }
        setOperatorSaveFailed(identity, true)
        continue
      }
      sessionId = result.data.id
      if (removedSessionIds.has(sessionId)) continue
      setOperatorSession(sessionId, current.surface, identity)
      setOperatorSaveFailed(identity, false)
      savedThreads.set(id, current)
      saved = true
    }
    return saved
  })()
    .catch((error: unknown) => {
      logger.warn('[studio-operator-history] persist failed', { error })
      setOperatorSaveFailed(
        { threadScope: request.scope, localThreadId: id },
        true,
      )
      return false
    })
    .finally(() => {
      pendingSaves.delete(id)
    })
  return queue.promise
}

/** 测试用：把「这次页面加载」重置掉。⛔ 生产代码不要调它。 */
export function resetOperatorHistoryHydrationForTests(): void {
  hydratedScopes.clear()
  activeUserId = null
  activeWorkspace = null
  removedSessionIds.clear()
  savedThreads.clear()
}

async function listOperatorSessions(
  workspace: WorkspacePersistence,
): Promise<AssistantConversationSummary[]> {
  const result = await listAssistantConversationsAPI({
    surface: workspace.surface,
    workspaceKey: workspace.workspaceKey,
    ...(workspace.projectId ? { projectId: workspace.projectId } : {}),
    operatorOnly: true,
    limit: STUDIO_OPERATOR_HISTORY.listLimit,
  })
  if (!result.success) throw new Error(result.error)
  return result.data
}

export interface UseStudioOperatorHistoryResult {
  /** 当前工作区的会话列表，按 updatedAt 倒序。 */
  sessions: readonly AssistantConversationSummary[]
  /** 当前这条线程在库里的行；`null` = 还没落过库。 */
  currentSessionId: string | null
  loadingSessionId: string | null
  renamingSessionId: string | null
  renameSession(
    session: AssistantConversationSummary,
    title: string,
  ): Promise<boolean>
  isHydrating: boolean
  /** 载入历史失败时说了什么 —— ⛔ 不静默。 */
  error: string | null
  selectSession(session: AssistantConversationSummary): void
  refreshSessions(force?: boolean): void
  retrySave(): Promise<boolean>
  deletingSessionId: string | null
  deleteSession(session: AssistantConversationSummary): Promise<boolean>
}

export function useStudioOperatorHistory({
  userId,
  workspace,
  projectId,
}: {
  userId: string | null
  workspace: AssistantWorkspace
  projectId?: string
}): UseStudioOperatorHistoryResult {
  const t = useTranslations('StudioOperator.history')
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null)
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(
    null,
  )
  const loadIntent = useRef(0)
  const lifecycle = useRef(0)
  const mountedScope = useRef<string | null>(null)
  const renamePending = useRef(false)
  const { entries, sessionId, question, confirm, saveFailed } =
    useStudioOperatorState()
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(
    null,
  )
  const removedIds = useRef(removedSessionIds)
  const deletingRef = useRef(false)
  const [sessions, setSessions] = useState<
    readonly AssistantConversationSummary[]
  >([])
  const scope = assistantWorkspaceScope(userId, workspace, projectId)
  const workspaceKey = assistantWorkspaceKey(workspace, projectId)
  const surface = assistantWorkspaceSurface(workspace)
  const domain = assistantWorkspaceDomain(workspace)
  const [isHydrating, setIsHydrating] = useState(
    scope !== null && !hydratedScopes.has(scope),
  )
  const [error, setError] = useState<string | null>(null)
  const isActive = useCallback(
    (epoch: number) =>
      scope !== null &&
      mountedScope.current === scope &&
      lifecycle.current === epoch &&
      getOperatorState().threadScope === scope,
    [scope],
  )
  const listPending = useRef<{
    scope: string
    promise: Promise<AssistantConversationSummary[]>
  } | null>(null)
  const lastListedAt = useRef<{
    scope: string
    at: number
  } | null>(null)
  const fetchSessions = useCallback(() => {
    if (!scope || !workspaceKey || !userId) return Promise.resolve([])
    if (listPending.current?.scope === scope) return listPending.current.promise
    const pending = listOperatorSessions({
      userId,
      scope,
      workspaceKey,
      surface,
      projectId,
    })
      .then((items) => {
        lastListedAt.current = { scope, at: Date.now() }
        return items
      })
      .finally(() => {
        if (listPending.current?.promise === pending) listPending.current = null
      })
    listPending.current = { scope, promise: pending }
    return pending
  }, [scope, workspaceKey, userId, surface, projectId])

  const refreshSessions = useCallback(
    (force = false) => {
      const epoch = lifecycle.current
      if (!isActive(epoch)) return
      if (
        !force &&
        lastListedAt.current?.scope === scope &&
        Date.now() - lastListedAt.current.at <
          STUDIO_OPERATOR_HISTORY.listFreshMs
      )
        return
      setIsHydrating(true)
      void fetchSessions()
        .then((items) => {
          if (!isActive(epoch)) return
          setSessions(items.filter((item) => !removedIds.current.has(item.id)))
          setError(null)
        })
        .catch(() => {
          if (isActive(epoch)) setError(t('loadFailed'))
        })
        .finally(() => {
          if (isActive(epoch)) setIsHydrating(false)
        })
    },
    [fetchSessions, isActive, scope, t],
  )

  const deleteSession = useCallback(
    async (session: AssistantConversationSummary) => {
      const epoch = lifecycle.current
      if (!isActive(epoch) || session.workspaceKey !== workspaceKey)
        return false
      if (deletingRef.current) return false
      const current = getOperatorState()
      if (current.sessionId === session.id && current.status === 'working') {
        setError(t('deleteBusy'))
        return false
      }
      deletingRef.current = true
      removedIds.current.add(session.id)
      setDeletingSessionId(session.id)
      setError(null)
      try {
        const result = await deleteAssistantConversationAPI(session.id)
        if (!result.success && result.errorCode !== 'NOT_FOUND') {
          removedIds.current.delete(session.id)
          if (isActive(epoch)) setError(t('deleteFailed'))
          return false
        }
        const target = getOperatorThread(scope)
        if (target?.sessionId === session.id) resetOperatorThread(target)
        if (!isActive(epoch)) return true
        setSessions((items) => items.filter((item) => item.id !== session.id))
        return true
      } catch {
        removedIds.current.delete(session.id)
        if (isActive(epoch)) setError(t('deleteFailed'))
        return false
      } finally {
        deletingRef.current = false
        if (isActive(epoch)) setDeletingSessionId(null)
      }
    },
    [isActive, workspaceKey, scope, t],
  )

  const applyConversation = useCallback(
    async (id: string, surface: AssistantSurfaceId): Promise<boolean> => {
      const epoch = lifecycle.current
      if (!isActive(epoch) || !workspaceKey) return false
      const intent = ++loadIntent.current
      const before = getOperatorState()
      setLoadingSessionId(id)
      setError(null)
      try {
        const result = await getAssistantConversationAPI({
          surface,
          id,
          workspaceKey,
          operatorOnly: true,
        })
        if (
          !isActive(epoch) ||
          intent !== loadIntent.current ||
          removedIds.current.has(id) ||
          getOperatorState().entries !== before.entries ||
          getOperatorState().localThreadId !== before.localThreadId
        )
          return false
        if (
          !result.success ||
          !result.data ||
          result.data.workspaceKey !== workspaceKey
        ) {
          setError(t('loadFailed'))
          return false
        }
        loadOperatorThread({
          history: fromStoredOperatorMessages(result.data.messages),
          /**
           * 结论记录从**另一列**回填（v2 §7.7，commit #13）：`GET` 的响应
           * 本来就带着 `rounds`（`AssistantConversationRecord`），⛔ 不再开
           * 第二条读路由。
           */
          rounds: result.data.rounds,
          sessionId: result.data.id,
          sessionSurface: result.data.surface,
          // 末尾还没决定的那一下放回面板（owner 09-27：刷新丢卡）。
          pending: pendingFromStoredMessages(result.data.messages),
        })
        return true
      } catch {
        if (isActive(epoch) && intent === loadIntent.current)
          setError(t('loadFailed'))
        return false
      } finally {
        if (isActive(epoch) && intent === loadIntent.current)
          setLoadingSessionId(null)
      }
    },
    [isActive, workspaceKey, t],
  )

  /**
   * 刷新可续（本片验收 ③）—— 载回**最近一条**线程的可读历史。
   *
   * ⚠ 判据取自列表里的 `operatorThread`，⛔ 不直接用 `getAssistantConversationAPI`
   * 的「按 surface 取最新」：那条会把音频档旧助手刚写的一条对白当成「最近的线程」
   * 拉回来。
   * ⚠ 请求飞在半空时用户已经开口了就放弃 —— 覆盖掉他刚说的话比不载回历史坏得多。
   */
  useEffect(() => {
    const epoch = ++lifecycle.current
    mountedScope.current = scope
    loadIntent.current += 1
    setSessions([])
    setLoadingSessionId(null)
    setRenamingSessionId(null)
    setDeletingSessionId(null)
    setError(null)
    if (activeUserId !== userId) {
      claimOperatorThreadScope(null, domain)
      hydratedScopes.clear()
      savedThreads.clear()
      activeWorkspace = null
      activeUserId = userId
    }
    if (activeWorkspace && activeWorkspace.scope !== scope) {
      const previous = getOperatorThread(activeWorkspace.scope)
      if (previous && !previous.saveFailed)
        void persistThread({ ...activeWorkspace, snapshot: previous })
    }
    activeWorkspace =
      scope && workspaceKey && userId
        ? { userId, scope, workspaceKey, surface, projectId }
        : null
    claimOperatorThreadScope(scope, domain)
    const before = getOperatorState()
    const restoreLatest = scope !== null && !hydratedScopes.has(scope)
    if (scope) hydratedScopes.add(scope)
    setIsHydrating(scope !== null)

    if (scope)
      void (async () => {
        try {
          const merged = await fetchSessions()
          if (!isActive(epoch)) return
          setSessions(merged.filter((item) => !removedIds.current.has(item.id)))

          const latest = merged[0]
          const current = getOperatorState()
          if (
            !restoreLatest ||
            !latest ||
            current.localThreadId !== before.localThreadId ||
            current.entries.length > 0 ||
            current.sessionId
          )
            return
          await applyConversation(latest.id, latest.surface)
        } catch {
          if (isActive(epoch)) setError(t('loadFailed'))
        } finally {
          if (isActive(epoch)) setIsHydrating(false)
        }
      })()
    return () => {
      lifecycle.current += 1
      mountedScope.current = null
      loadIntent.current += 1
    }
  }, [
    applyConversation,
    fetchSessions,
    scope,
    workspaceKey,
    surface,
    projectId,
    userId,
    domain,
    isActive,
    t,
  ])

  const save = useCallback(async () => {
    const epoch = lifecycle.current
    if (!isActive(epoch) || !scope || !workspaceKey || !userId) return false
    const current = getOperatorState()
    const saved = await persistThread({
      userId,
      scope,
      workspaceKey,
      surface,
      projectId,
      snapshot: current,
    })
    if (
      saved &&
      isActive(epoch) &&
      getOperatorState().localThreadId === current.localThreadId
    )
      refreshSessions(true)
    return saved
  }, [
    isActive,
    scope,
    workspaceKey,
    userId,
    surface,
    projectId,
    refreshSessions,
  ])

  /**
   * 写入时机 = **一条防抖**。
   *
   * ⭐ 「一轮结束」「用户发言」「切域」三个时机不必各写一条触发：它们全都以
   * 「`entries` 变了」的形式经过这里（域标记本身就是一条 entry）。流跑着的时候
   * 每一步都会重排这个定时器，所以一轮下来只写一次。
   * ⚠ 依赖是 `entries` 这个数组引用 —— store 的每次写入都换新引用（快照是不可变
   * 的），这正是它能当「有没有新东西」的判据的原因。
   */
  useEffect(() => {
    if (entries.length === 0) return
    const timer = setTimeout(() => {
      void save()
    }, STUDIO_OPERATOR_HISTORY.saveDebounceMs)
    return () => clearTimeout(timer)
  }, [entries, save])

  /**
   * 问题 / 卡片**到货与决定**也要落一次（owner 09-27 刷新丢卡）：它们不在 `entries`
   * 里，不单独触发的话，一张卡摆出来之后刷新，库里那一份还没有它。
   * ⚠ 只在线程已经有东西（本页新写的或载回的）时才存 —— 空线程上没有可挂的地方。
   */
  const lastDecision = useRef({ question, confirm })
  useEffect(() => {
    const previous = lastDecision.current
    lastDecision.current = { question, confirm }
    if (previous.question === question && previous.confirm === confirm) return
    if (entries.length === 0 && sessionId === null) return
    const timer = setTimeout(() => {
      void save()
    }, STUDIO_OPERATOR_HISTORY.saveDebounceMs)
    return () => clearTimeout(timer)
    // ⚠ 只认问题 / 卡片本身变了；`entries` 那条防抖归上面那一个 effect 管。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question, confirm, save])

  const renameSession = useCallback(
    async (session: AssistantConversationSummary, title: string) => {
      const epoch = lifecycle.current
      if (!isActive(epoch) || session.workspaceKey !== workspaceKey)
        return false
      if (renamePending.current) return false
      renamePending.current = true
      setRenamingSessionId(session.id)
      setError(null)
      try {
        const result = await renameAssistantConversationAPI(
          session.id,
          title.trim(),
        )
        if (!result.success) {
          if (isActive(epoch)) setError(t('renameFailed'))
          return false
        }
        if (!isActive(epoch)) return true
        setSessions((items) =>
          items.map((item) =>
            item.id === session.id
              ? { ...item, title: result.data.title }
              : item,
          ),
        )
        return true
      } catch {
        if (isActive(epoch)) setError(t('renameFailed'))
        return false
      } finally {
        renamePending.current = false
        if (isActive(epoch)) setRenamingSessionId(null)
      }
    },
    [isActive, workspaceKey, t],
  )

  const selectSession = useCallback(
    (session: AssistantConversationSummary) => {
      if (session.workspaceKey !== workspaceKey) return
      if (session.id === getOperatorState().sessionId) return
      void applyConversation(session.id, session.surface)
    },
    [applyConversation, workspaceKey],
  )

  return {
    sessions,
    currentSessionId: sessionId,
    isHydrating,
    loadingSessionId,
    renamingSessionId,
    renameSession,
    error: saveFailed ? t('saveFailed') : error,
    selectSession,
    refreshSessions,
    retrySave: save,
    deletingSessionId,
    deleteSession,
  }
}
