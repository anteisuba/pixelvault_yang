'use client'

import { useSyncExternalStore } from 'react'

import { TAG_ADD_ACK_MS } from '@/constants/motion'

/**
 * 查资料「加到角色 N」之后，输入框里那一页亮一个小点（owner 2026-09-27 查资料 B 动效表，
 * 1.2s）。纯界面信号：⛔ 不进 studio-context、不进草稿。
 */
let flashing: number | null = null
let timer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function flashTagTarget(characterIndex: number): void {
  flashing = characterIndex
  emit()
  clearTimeout(timer)
  timer = setTimeout(() => {
    flashing = null
    emit()
  }, TAG_ADD_ACK_MS)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 此刻亮着点的那一位角色（下标），没有就是 `null`。 */
export function useTagTargetFlash(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => flashing,
    () => null,
  )
}
