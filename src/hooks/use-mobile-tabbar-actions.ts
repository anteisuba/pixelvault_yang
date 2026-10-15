'use client'

import { useEffect, useSyncExternalStore } from 'react'

/**
 * 手机底栏「长成动作栏」（手机稿 v10 素材页，owner 2026-10-09「长按进多选，像谷歌相册，
 * 底栏变动作栏」）：底栏是外壳 `MobileShell` 的，动作在页面里 —— 页面借底栏那一格
 * （portal 进去），底栏同时把五格糊掉、动作由糊变清。同一条栏变内容，⛔ 另浮一条。
 *
 * - 底栏：`useMobileTabBarActionsHost(el)` 交出那一格、`useMobileTabBarActionsActive()`
 *   读「有没有人在借」。
 * - 页面：`useMobileTabBarActions(active)` 借用期间返回那一格（拿去 `createPortal`），
 *   ⛔ 页面别自己找 DOM。
 */

let host: HTMLElement | null = null
let claims = 0
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getHost = () => host
const getActive = () => claims > 0
const getServerHost = () => null
const getServerActive = () => false

export function useMobileTabBarActionsHost(element: HTMLElement | null) {
  useEffect(() => {
    if (!element) return
    host = element
    emit()
    return () => {
      if (host === element) host = null
      emit()
    }
  }, [element])
}

export function useMobileTabBarActionsActive(): boolean {
  return useSyncExternalStore(subscribe, getActive, getServerActive)
}

export function useMobileTabBarActions(active: boolean): HTMLElement | null {
  useEffect(() => {
    if (!active) return
    claims += 1
    emit()
    return () => {
      claims -= 1
      emit()
    }
  }, [active])
  const element = useSyncExternalStore(subscribe, getHost, getServerHost)
  return active ? element : null
}
