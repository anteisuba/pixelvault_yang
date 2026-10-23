'use client'

import { useCallback, useSyncExternalStore } from 'react'

import { STUDIO_SHELL_SPLIT } from '@/constants/studio-shell'

/**
 * `/studio` 外壳那一根分隔线的状态（第 9f 步方向 E）：对话栏多宽、收没收起。
 *
 * ⭐ 模块级 store + localStorage：换台、刷新都记得住；同一页上只有一根线，⛔ 不进 context。
 * ⚠ 服务端快照恒为默认值（首帧与 SSR 一致），挂上之后再读 localStorage。
 */

export interface StudioShellSplit {
  conversationPx: number
  /** 对话收起（往左拖到底）：台顶最左边出现「‹ 对话名」。 */
  conversationCollapsed: boolean
}

const DEFAULT_SPLIT: StudioShellSplit = {
  conversationPx: STUDIO_SHELL_SPLIT.defaultConversationPx,
  conversationCollapsed: false,
}

let current: StudioShellSplit | null = null
const listeners = new Set<() => void>()

function read(): StudioShellSplit {
  if (current) return current
  current = DEFAULT_SPLIT
  if (typeof window === 'undefined') return current
  try {
    const raw = window.localStorage.getItem(STUDIO_SHELL_SPLIT.storageKey)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (
        parsed &&
        typeof parsed === 'object' &&
        'conversationPx' in parsed &&
        typeof parsed.conversationPx === 'number' &&
        Number.isFinite(parsed.conversationPx)
      ) {
        current = {
          conversationPx: Math.max(
            STUDIO_SHELL_SPLIT.minConversationPx,
            Math.round(parsed.conversationPx),
          ),
          conversationCollapsed:
            'conversationCollapsed' in parsed &&
            parsed.conversationCollapsed === true,
        }
      }
    }
  } catch {
    // 读不出来就用默认值 —— 一个界面偏好不值得让页面报错。
  }
  return current
}

function write(next: StudioShellSplit): void {
  const previous = read()
  if (
    previous.conversationPx === next.conversationPx &&
    previous.conversationCollapsed === next.conversationCollapsed
  )
    return
  current = next
  try {
    window.localStorage.setItem(
      STUDIO_SHELL_SPLIT.storageKey,
      JSON.stringify(next),
    )
  } catch {
    // 存不下就只在本次会话里生效。
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getServerSnapshot = () => DEFAULT_SPLIT

/** 测试用：回到默认值。⛔ 生产代码不要调它。 */
export function resetStudioShellSplitForTests(): void {
  current = null
}

export function useStudioShellSplit() {
  const split = useSyncExternalStore(subscribe, read, getServerSnapshot)
  const setConversationPx = useCallback((px: number) => {
    write({ conversationPx: Math.round(px), conversationCollapsed: false })
  }, [])
  const setConversationCollapsed = useCallback((collapsed: boolean) => {
    write({ ...read(), conversationCollapsed: collapsed })
  }, [])
  return { split, setConversationPx, setConversationCollapsed }
}
