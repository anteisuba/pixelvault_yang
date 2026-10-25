'use client'

import { useSyncExternalStore } from 'react'

/**
 * 助手头像此刻在哪（用户 10-25：收起对话后头像飞进左栏最上面那格）。
 *
 * 白板（`StudioShellBoard`）写、左栏读 —— 两处不在同一棵 Provider 下，⛔ 进 context；
 * 同一页只有一颗头像，模块级 store 就够。
 * - `docked`：对话收起（含正在往左收的那一拍）→ 头像在左栏那格；否则在对话头。
 * - `expand`：左栏那格换了人之后把对话拉回来（白板挂着时才有）。
 */
interface StudioShellAvatarState {
  docked: boolean
  expand: (() => void) | null
}

const INITIAL: StudioShellAvatarState = { docked: false, expand: null }

let current = INITIAL
const listeners = new Set<() => void>()

export function setStudioShellAvatar(next: StudioShellAvatarState): void {
  if (current.docked === next.docked && current.expand === next.expand) return
  current = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const read = () => current
const getServerSnapshot = () => INITIAL

export function useStudioShellAvatar(): StudioShellAvatarState {
  return useSyncExternalStore(subscribe, read, getServerSnapshot)
}
