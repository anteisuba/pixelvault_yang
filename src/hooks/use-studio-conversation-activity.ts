'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { STUDIO_CONVERSATION_ACTIVITY } from '@/constants/studio-shell'
import { getStudioConversationActivityAPI } from '@/lib/api-client'
import { onStudioConversationActivity } from '@/lib/studio-active-conversation'
import type { StudioConversationActivity } from '@/types/studio-conversation-activity'

export interface StudioConversationActivityView extends StudioConversationActivity {
  /** 出完了而你还没看过（小点）。 */
  unseen: boolean
}

type SeenMap = Record<string, string>

function readSeen(): SeenMap {
  try {
    const raw = window.localStorage.getItem(
      STUDIO_CONVERSATION_ACTIVITY.seenStorageKey,
    )
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? (parsed as SeenMap) : {}
  } catch {
    return {}
  }
}

function writeSeen(seen: SeenMap) {
  try {
    window.localStorage.setItem(
      STUDIO_CONVERSATION_ACTIVITY.seenStorageKey,
      JSON.stringify(seen),
    )
  } catch {
    // 无痕窗口 / 存储被禁：小点这一拍不记，下次照旧算。
  }
}

/**
 * 左边列表那几段对话的封面 / 进度圈 / 小点（第 9f 步 9f-3）。
 *
 * - 列表换了、对话里刚发出一枪（`notifyStudioConversationActivity`）就问一次；有任务在跑时
 *   每 `pollMs` 再问，都跑完就停。
 * - 小点：每段对话「你最后看它的时间」只记在本机（owner 10-24 同意）。头一回见到的对话按
 *   「已看过」记下，⛔ 一进来满屏小点；正开着的那一段随看随记。
 */
export function useStudioConversationActivity(
  ids: readonly string[],
  currentId: string | null,
): ReadonlyMap<string, StudioConversationActivityView> {
  const key = ids.join(',')
  const [activity, setActivity] = useState<
    readonly StudioConversationActivity[]
  >([])
  const [seen, setSeen] = useState<SeenMap>({})
  const loadedSeen = useRef(false)

  const load = useCallback(async () => {
    if (!key) return
    const result = await getStudioConversationActivityAPI(key.split(','))
    if (result.success && result.data) setActivity(result.data)
  }, [key])

  useEffect(() => {
    // 首帧与 SSR 一致：挂上之后才读本机记录、才去问。
    void Promise.resolve().then(load)
    return onStudioConversationActivity(() => void load())
  }, [load])

  const running = activity.some((item) => item.progress)
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(
      () => void load(),
      STUDIO_CONVERSATION_ACTIVITY.pollMs,
    )
    return () => window.clearInterval(timer)
  }, [load, running])

  // 认出新出完的：头一回见到的记成已看过；正开着的那段随看随记。
  useEffect(() => {
    if (!activity.length) return
    const base = loadedSeen.current ? seen : readSeen()
    loadedSeen.current = true
    let changed = false
    const next: SeenMap = { ...base }
    for (const item of activity) {
      if (!item.latestDoneAt) continue
      if (!(item.id in next) || item.id === currentId) {
        if (next[item.id] !== item.latestDoneAt) {
          next[item.id] = item.latestDoneAt
          changed = true
        }
      }
    }
    if (!changed && base === seen) return
    if (changed) writeSeen(next)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 本机记录只能在挂上之后读，读完并进 state。
    setSeen(next)
  }, [activity, currentId, seen])

  return useMemo(
    () =>
      new Map(
        activity.map((item) => [
          item.id,
          {
            ...item,
            unseen: Boolean(
              item.latestDoneAt &&
              item.id !== currentId &&
              seen[item.id] &&
              seen[item.id] < item.latestDoneAt,
            ),
          },
        ]),
      ),
    [activity, currentId, seen],
  )
}
