'use client'

import { useSyncExternalStore } from 'react'

/**
 * 手机全局左侧滑导航抽屉的开关状态 —— 外壳 `MobileShell` 挂载唯一抽屉实例，
 * 各根页面顶栏的左上按钮（`MobileDrawerTrigger`）与左缘右滑手势共用这一份状态。
 */
let drawerOpen = false
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot() {
  return drawerOpen
}

export function setMobileDrawerOpen(next: boolean) {
  if (drawerOpen === next) return
  drawerOpen = next
  listeners.forEach((listener) => listener())
}

export function openMobileDrawer() {
  setMobileDrawerOpen(true)
}

export function useMobileDrawerOpen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
