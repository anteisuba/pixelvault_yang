'use client'

import { useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'

import { STUDIO_CONVERSATION_QUERY } from '@/constants/routes'
import { usePathname, useRouter } from '@/i18n/navigation'
import type { UseStudioOperatorHistoryResult } from '@/hooks/use-studio-operator-history'
import type { StudioOperatorActions } from '@/hooks/use-studio-operator-actions'
import { useStudioOperatorState } from '@/hooks/use-studio-operator-store'
import {
  conversationIdFromPath,
  studioConversationHref,
  studioShellRouteKind,
} from '@/lib/studio-shell-route'

/**
 * 地址 ↔ 当前对话（第 9f 步方向 E）。
 *
 * - **对话变了 → 改地址**（`replace`，⛔ 不多压一层历史）：首页说完第一句、落库拿到编号，
 *   地址从 `/studio` 变成 `/studio/c/<编号>`；开着台时只换 `?c=<编号>`，台自己的参数原样留着。
 * - **地址变了 → 换对话**（后退 / 前进 / 直接改地址）：换到地址里那一段；退回 `/studio`
 *   就是一段新对话。
 * ⚠ 两头各认各的变化（上一拍记在 ref 里）：同一拍里地址与对话都变了（首页第一句落库那一下），
 *   只按「对话变了」走，⛔ 不来回打架。
 * ⚠ 一进来那一拍不动手：载回哪一段由水化按地址给（`StudioOperatorHistoryRestore`）。
 */
export function useStudioConversationUrl({
  history,
  actions,
}: {
  history: UseStudioOperatorHistoryResult | null
  actions: StudioOperatorActions | null
}): void {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { sessionId } = useStudioOperatorState()
  const kind = studioShellRouteKind(pathname)
  const queryId = searchParams.get(STUDIO_CONVERSATION_QUERY)
  /** 地址里说的是哪一段：`null` = 首页（新对话）；`undefined` = 地址没说（台上没带 `?c=`、整页）。 */
  const urlId =
    kind === 'home'
      ? conversationIdFromPath(pathname)
      : kind === 'bench'
        ? (queryId ?? undefined)
        : undefined
  const search = searchParams.toString()

  const last = useRef<{
    urlId: string | null | undefined
    sessionId: string | null
  } | null>(null)
  useEffect(() => {
    const previous = last.current
    last.current = { urlId, sessionId }
    if (!previous) return
    if (kind === 'page') return

    if (sessionId !== previous.sessionId) {
      // 对话变了 → 地址跟上。
      if (kind === 'home') {
        const target = studioConversationHref(sessionId)
        if (target !== pathname) router.replace(target, { scroll: false })
        return
      }
      if ((queryId ?? null) === sessionId) return
      const params = new URLSearchParams(search)
      if (sessionId) params.set(STUDIO_CONVERSATION_QUERY, sessionId)
      else params.delete(STUDIO_CONVERSATION_QUERY)
      const query = params.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      })
      return
    }

    if (urlId === previous.urlId || urlId === undefined) return
    // 地址变了 → 换对话。
    if (urlId === null) {
      if (sessionId !== null) actions?.newThread()
      return
    }
    if (urlId !== sessionId) history?.openSession(urlId)
  }, [
    actions,
    history,
    kind,
    pathname,
    queryId,
    router,
    search,
    sessionId,
    urlId,
  ])
}
