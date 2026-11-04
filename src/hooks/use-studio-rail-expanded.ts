'use client'

import { useCallback, useSyncExternalStore } from 'react'

import { STUDIO_SHELL_RAIL } from '@/constants/studio-shell'

/**
 * 左栏带字那一档开没开（owner 11-04：记住上次的样子）。存在本机，几个挂着左栏的地方
 *（外壳、设置等页的 `AppRail`）读同一份。⚠ 首帧与 SSR 一样是收着的，挂上之后才读本机。
 */
const listeners = new Set<() => void>()
/** 本机存不了时（无痕 / 被禁）这一次开合记在这里。 */
let fallback = false

function read(): boolean {
  try {
    return (
      window.localStorage.getItem(STUDIO_SHELL_RAIL.expandedStorageKey) === '1'
    )
  } catch {
    return fallback
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === STUDIO_SHELL_RAIL.expandedStorageKey) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function useStudioRailExpanded(): [boolean, (next: boolean) => void] {
  const expanded = useSyncExternalStore(subscribe, read, () => false)
  const setExpanded = useCallback((next: boolean) => {
    fallback = next
    try {
      window.localStorage.setItem(
        STUDIO_SHELL_RAIL.expandedStorageKey,
        next ? '1' : '0',
      )
    } catch {
      // 无痕窗口 / 存储被禁：这一次照样开合，只是不记。
    }
    for (const listener of listeners) listener()
  }, [])
  return [expanded, setExpanded]
}
