'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'

import type { CanvasShellPanelId } from '@/constants/canvas-shell'

/**
 * 画布左侧面板开着哪一格 —— 画布与全站侧栏**共用的一份**（owner 2026-10-08 换皮）。
 *
 * 画布自己那条 44px 图标栏并进了全站 `AppSidebar`：「画布」那一项下面长出三颗子图标
 * （节点一览 / 角色 / 素材库），点一颗 = 在侧栏旁边打开那一格面板。侧栏挂在 `(main)`
 * 布局上、画布挂在页面里，两边不在同一棵 Provider 下，所以状态住在模块级 store。
 *
 * ⚠ `mounted` 由画布在挂载期间登记：只有画布真的在屏上时侧栏才长出子图标（手机档
 *   画布不挂桌面外壳，侧栏本来也不在）。画布卸载时面板一并收回，⛔ 不把上一个项目的
 *   「开着素材库」带到下一次进画布。
 */
interface CanvasShellPanelState {
  readonly mounted: boolean
  readonly activePanel: CanvasShellPanelId | null
}

const INITIAL: CanvasShellPanelState = { mounted: false, activePanel: null }

let state: CanvasShellPanelState = INITIAL
const listeners = new Set<() => void>()

function emit(next: CanvasShellPanelState) {
  if (
    next.mounted === state.mounted &&
    next.activePanel === state.activePanel
  ) {
    return
  }
  state = next
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => state
const getServerSnapshot = () => INITIAL

export function setCanvasShellPanel(panel: CanvasShellPanelId | null) {
  emit({ ...state, activePanel: panel })
}

/** 点同一颗 = 收起，点另一颗 = 换过去。 */
export function toggleCanvasShellPanel(panel: CanvasShellPanelId) {
  setCanvasShellPanel(state.activePanel === panel ? null : panel)
}

/** 测试用：回到初始态。 */
export function resetCanvasShellPanelStore() {
  emit(INITIAL)
}

export function useCanvasShellPanel(): CanvasShellPanelState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/**
 * 画布这一侧：登记「画布在屏上」，并像 `useState` 一样读写开着的那一格。
 */
export function useCanvasShellPanelHost(): readonly [
  CanvasShellPanelId | null,
  (panel: CanvasShellPanelId | null) => void,
] {
  const { activePanel } = useCanvasShellPanel()

  useEffect(() => {
    emit({ mounted: true, activePanel: null })
    return () => emit(INITIAL)
  }, [])

  const set = useCallback(
    (panel: CanvasShellPanelId | null) => setCanvasShellPanel(panel),
    [],
  )
  return [activePanel, set] as const
}
