'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { useSearchParams } from 'next/navigation'

import { STUDIO_CONVERSATION_QUERY } from '@/constants/routes'
import { useStudioOperatorState } from '@/hooks/use-studio-operator-store'
import { usePathname } from '@/i18n/navigation'
import { setAssistantConversationBenchAPI } from '@/lib/api-client'
import {
  conversationIdFromPath,
  studioShellRouteKind,
} from '@/lib/studio-shell-route'

/**
 * 「台跟着对话走」（第 9f 步 9f-3）：每段对话记住自己最后开着哪个台。
 *
 * 记录这一侧（`useStudioConversationBenchSync`，外壳挂一份）：地址上的对话就是此刻开着的那段时，
 * 台的地址变了就记下 —— 开着台 = 台的地址（`/studio/image/tags`），只剩对话 = null。
 * ⚠ 只认「地址上的对话 = 当前对话」那一拍：从列表点另一段时，地址先换、对话后换，中间那一拍
 *   ⛔ 把新台记到旧对话上。
 *
 * 列表那一侧（`useStudioConversationBenchOverrides`）：刚记下、服务端列表还没刷新到的那几段，
 * 点列表时先用这里的。
 */
const overrides = new Map<string, string | null>()
let snapshot: ReadonlyMap<string, string | null> = new Map()
const listeners = new Set<() => void>()

function remember(id: string, bench: string | null) {
  overrides.set(id, bench)
  snapshot = new Map(overrides)
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const EMPTY: ReadonlyMap<string, string | null> = new Map()

export function useStudioConversationBenchOverrides(): ReadonlyMap<
  string,
  string | null
> {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY,
  )
}

/** 对话 → 最后开着的台：刚记下的优先，再看服务端列表里的。 */
export function conversationBenchOf(
  id: string,
  serverBench: string | null | undefined,
  local: ReadonlyMap<string, string | null>,
): string | null {
  return local.has(id) ? (local.get(id) ?? null) : (serverBench ?? null)
}

export function useStudioConversationBenchSync(): void {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { sessionId } = useStudioOperatorState()
  const kind = studioShellRouteKind(pathname)
  const urlId =
    kind === 'home'
      ? conversationIdFromPath(pathname)
      : kind === 'bench'
        ? searchParams.get(STUDIO_CONVERSATION_QUERY)
        : null
  const bench = kind === 'bench' ? pathname : null

  useEffect(() => {
    if (!sessionId || urlId !== sessionId) return
    if (kind !== 'home' && kind !== 'bench') return
    if (overrides.has(sessionId) && overrides.get(sessionId) === bench) return
    remember(sessionId, bench)
    void setAssistantConversationBenchAPI(sessionId, bench)
  }, [bench, kind, sessionId, urlId])
}
