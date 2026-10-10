'use client'

import { useEffect, useSyncExternalStore } from 'react'

import {
  MOBILE_NAV_LAST_TOOL_STORAGE_KEY,
  MOBILE_NAV_RETURN_STORAGE_KEY,
  activeShellTool,
  isStudioPath,
} from '@/constants/navigation'

/**
 * 手机底栏的两样本地记忆（owner 2026-10-09「＋ 新建」v10）：
 * - **上次用的工具**：＋ 面板那一行标「上次」，长按 ＋ 直接进它；
 * - **进工作台之前站在哪页**：工作台顶上那颗 ← 回到那里（底栏随之升回来）。
 *
 * 纯本地偏好，不上服务端。读写全裹 try/catch：隐私窗口里 localStorage 会直接抛。
 */

const listeners = new Set<() => void>()

function read(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  if (read(key) === value) return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // 记不住而已，不影响导航。
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 上次用的工具 id（`SHELL_NAV_TOOLS` 的 id）；没用过 / 服务端渲染 = null。 */
export function useLastStudioToolId(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => read(MOBILE_NAV_LAST_TOOL_STORAGE_KEY),
    () => null,
  )
}

/** 工作台 ← 回到哪：进工作台之前最后站的那一页；没有记录 = null。 */
export function useMobileReturnPath(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => read(MOBILE_NAV_RETURN_STORAGE_KEY),
    () => null,
  )
}

/** 跟着路由记：在工作台就记工具，不在就记这一页（工作台 ← 的去处）。 */
export function useRecordMobileNav(pathname: string): void {
  useEffect(() => {
    if (isStudioPath(pathname)) {
      const tool = activeShellTool(pathname)
      if (tool) write(MOBILE_NAV_LAST_TOOL_STORAGE_KEY, tool.id)
      return
    }
    write(MOBILE_NAV_RETURN_STORAGE_KEY, pathname)
  }, [pathname])
}
