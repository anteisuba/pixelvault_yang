'use client'

import { useEffect, useSyncExternalStore } from 'react'

/**
 * 手机底栏「往下滑收起、往上滑回来」（手机操作习惯清单，owner 2026-10-15 定；
 * 2026-10-17 真机反馈素材页没收）：方向由页面自己判（它知道自己的滚动容器），
 * 底栏只读一个开关。
 *
 * - 页面：`useHideMobileTabBar(hidden)`，离开页面自动交回（底栏回来）。
 * - 底栏：`useMobileTabBarHidden()`。
 */

let hidden = false
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function set(next: boolean) {
  if (hidden === next) return
  hidden = next
  listeners.forEach((listener) => listener())
}

const getHidden = () => hidden
const getServerHidden = () => false

export function useHideMobileTabBar(next: boolean) {
  useEffect(() => {
    set(next)
  }, [next])
  useEffect(() => () => set(false), [])
}

export function useMobileTabBarHidden(): boolean {
  return useSyncExternalStore(subscribe, getHidden, getServerHidden)
}
