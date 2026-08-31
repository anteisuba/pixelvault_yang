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
 * ── 跨域线程 × 单值 surface ───────────────────────────────────────
 * 一条线程可以跨图片 / 视频（拍板 8），而 `surface` 只有一格。方案：
 * **`surface` 记线程起始域，域切换以 domainMark 条目存在 messages 里**。
 * 代价是会话菜单要同时列两个 surface 再合并 —— 两次 GET，换来的是「切个域，
 * 刚才那条线程从历史里消失了」不会发生。
 *
 * ── 存什么 / 不存什么 ─────────────────────────────────────────────
 * 只存**可读历史**。撤销的 inverse、primed、就地确认条、改动登记簿、联网候选的
 * 「选用」钮、在飞上传 —— 一个都不存，因为它们是**对当前表单的控制权**，而重新
 * 加载之后表单早就不是当时那张（画布那边的原话：「一条几分钟前针对另一张图的
 * 提案，重新加载后再点应用只会做错事」）。结构上的保证见
 * `types/studio-operator-history.ts`：那个类型装不下 inverse。
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { STUDIO_OPERATOR_HISTORY } from '@/constants/studio-assistant-operator'
import {
  getAssistantConversationAPI,
  listAssistantConversationsAPI,
  upsertAssistantConversationAPI,
} from '@/lib/api-client'
import { logger } from '@/lib/logger'
import {
  fromStoredOperatorMessages,
  toOperatorHistory,
  toStoredOperatorMessages,
} from '@/lib/studio-operator-history'
import {
  getOperatorState,
  loadOperatorThread,
  setOperatorSession,
  useStudioOperatorState,
} from '@/hooks/use-studio-operator-store'
import {
  ASSISTANT_SURFACE_BY_DOMAIN,
  ASSISTANT_SURFACE_IDS,
  type AssistantConversationSummary,
  type AssistantSurfaceId,
} from '@/types/assistant-conversation'

/**
 * 操作员住在哪三个槽里。
 *
 * ⚠ **不是所有 surface**：画布是另一套（还按 projectId 分槽）。多列一个槽的下场
 * 是菜单里冒出一堆点开是别的界面的对话。
 * ⚠ `LORA` 从 P4-C 起进来 —— 那个槽**此前有别人在写**（`/studio/lora` 的旧助手，
 * 走 `use-prompt-assistant` 那条线）。会话菜单靠 summary 的 `operatorThread` 过滤，
 * 判据是「第一条消息有没有 `operator` 格」，所以旧线程不会混进来（与 P4-B 处理
 * 音频档旧助手写进 `IMAGE_STUDIO` 那一堆是同一条闸）。
 */
const OPERATOR_SURFACES = [
  ASSISTANT_SURFACE_IDS.imageStudio,
  ASSISTANT_SURFACE_IDS.videoStudio,
  ASSISTANT_SURFACE_IDS.lora,
] as const

/**
 * 这次页面加载水化过了没有。
 *
 * ⚠ 模块级而不是 ref：`StudioOperatorDock` 会随路由在图片 / 视频之间重挂，而
 * 「载回最近一条」是**每次页面加载一次**的事。用 ref 的下场是每次重挂都去覆盖
 * 一遍当前线程 —— 用户刚说了两句话，切个模态全没了。
 */
let hydratedThisPageLoad = false

/** 测试用：把「这次页面加载」重置掉。⛔ 生产代码不要调它。 */
export function resetOperatorHistoryHydrationForTests(): void {
  hydratedThisPageLoad = false
}

/**
 * 三个域各列一遍，合并按时间倒序。
 *
 * ⚠ 只留 `operatorThread`：音频工作台的旧助手写的也是 `IMAGE_STUDIO`（它的域
 * 回落到 image），`/studio/lora` 的旧助手写的是 `LORA` —— 混进来就是一串点开只有
 * 白文本的对话，而「点不动的历史比没有历史更糟」这句话，P2 那颗壳的注释里已经
 * 写过一次。
 */
async function listOperatorSessions(): Promise<AssistantConversationSummary[]> {
  const results = await Promise.all(
    OPERATOR_SURFACES.map((surface) =>
      listAssistantConversationsAPI({
        surface,
        limit: STUDIO_OPERATOR_HISTORY.listLimit,
      }),
    ),
  )
  return results
    .flatMap((result) => (result.success ? result.data : []))
    .filter((summary) => summary.operatorThread)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, STUDIO_OPERATOR_HISTORY.listLimit)
}

export interface UseStudioOperatorHistoryResult {
  /** 会话列表（两个域合并，按 `updatedAt` 倒序）。 */
  sessions: readonly AssistantConversationSummary[]
  /** 当前这条线程在库里的行；`null` = 还没落过库。 */
  currentSessionId: string | null
  isHydrating: boolean
  /** 载入历史失败时说了什么 —— ⛔ 不静默。 */
  error: string | null
  selectSession(session: AssistantConversationSummary): void
  refreshSessions(): void
}

export function useStudioOperatorHistory(): UseStudioOperatorHistoryResult {
  const { entries, sessionId } = useStudioOperatorState()
  const [sessions, setSessions] = useState<
    readonly AssistantConversationSummary[]
  >([])
  const [isHydrating, setIsHydrating] = useState(!hydratedThisPageLoad)
  const [error, setError] = useState<string | null>(null)
  /**
   * 一次只发一个 upsert。
   *
   * ⚠ 没有它的话，流式回合末尾的两次防抖可能重叠 —— 而两个并发的 upsert 里
   * **先发后到的那个会用更短的 messages 覆盖更长的那个**（服务端是整份替换）。
   * 表现是「最后一条日志偶尔会丢」。
   */
  const savingRef = useRef(false)
  const dirtyRef = useRef(false)

  const refreshSessions = useCallback(() => {
    void (async () => {
      setSessions(await listOperatorSessions())
    })()
  }, [])

  const applyConversation = useCallback(
    async (id: string, surface: AssistantSurfaceId): Promise<boolean> => {
      const result = await getAssistantConversationAPI({ surface, id })
      if (!result.success) {
        setError(result.error)
        return false
      }
      if (!result.data) return false
      loadOperatorThread({
        history: fromStoredOperatorMessages(result.data.messages),
        sessionId: result.data.id,
        sessionSurface: result.data.surface,
      })
      setError(null)
      return true
    },
    [],
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
    if (hydratedThisPageLoad) return
    hydratedThisPageLoad = true

    void (async () => {
      try {
        const merged = await listOperatorSessions()
        setSessions(merged)

        const latest = merged[0]
        const current = getOperatorState()
        if (!latest || current.entries.length > 0 || current.sessionId) return
        await applyConversation(latest.id, latest.surface)
      } finally {
        setIsHydrating(false)
      }
    })()
  }, [applyConversation])

  const save = useCallback(async () => {
    if (savingRef.current) {
      dirtyRef.current = true
      return
    }
    /**
     * ⭐ 现读 store，不吃闭包里的那份：防抖跨了好几次 render，而这一跳要存的是
     * **此刻**的线程（同一条论据见 `getOperatorState` 的头注）。
     */
    const current = getOperatorState()
    const history = [...current.history, ...toOperatorHistory(current.entries)]
    if (history.length === 0) return

    // 起始域只在第一次落库时定下来 —— 见 `sessionSurface` 的头注。
    const surface =
      current.sessionSurface ?? ASSISTANT_SURFACE_BY_DOMAIN[current.domain]

    savingRef.current = true
    try {
      const result = await upsertAssistantConversationAPI({
        ...(current.sessionId ? { id: current.sessionId } : {}),
        surface,
        messages: toStoredOperatorMessages(history),
      })
      if (!result.success) {
        logger.warn('[studio-operator-history] persist failed', {
          error: result.error,
          errorCode: result.errorCode,
        })
        /**
         * 那一行没了（别处删了 / 换了账号）。清掉身份，下一次改动会**整份**
         * 新建一行 —— `history` 里带着全部内容，所以什么都不会丢。
         */
        if (result.errorCode === 'ASSISTANT_CONVERSATION_NOT_FOUND') {
          setOperatorSession(null, null)
        }
        return
      }
      setOperatorSession(result.data.id, surface)
      refreshSessions()
    } finally {
      savingRef.current = false
      if (dirtyRef.current) {
        dirtyRef.current = false
        void save()
      }
    }
  }, [refreshSessions])

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

  const selectSession = useCallback(
    (session: AssistantConversationSummary) => {
      if (session.id === getOperatorState().sessionId) return
      void applyConversation(session.id, session.surface)
    },
    [applyConversation],
  )

  return {
    sessions,
    currentSessionId: sessionId,
    isHydrating,
    error,
    selectSession,
    refreshSessions,
  }
}
