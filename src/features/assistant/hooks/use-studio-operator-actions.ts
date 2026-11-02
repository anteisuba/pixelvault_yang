'use client'

import { useSyncExternalStore } from 'react'

/**
 * 挂着的那位操作员**对外的几只手**（第 9f 步）：`/studio` 外壳左边列表的「新对话」要用到，
 * 而驱动 hook 只在面板外壳（`StudioOperatorDock`）里调一次。
 *
 * ⚠ 与 `useStudioOperatorHistoryView` 同一个写法：Dock 发布、别处只读，⛔ 别在列表里再调一次
 *   `useAssistantOperator` —— 第二个实例会再挂一条流、再认领一次作用域。
 */
export interface StudioOperatorActions {
  /** 新会话（与面板头部「新对话」同一只手：先掐掉在飞的流）。 */
  newThread(): void
}

let published: StudioOperatorActions | null = null
const listeners = new Set<() => void>()

export function publishStudioOperatorActions(
  next: StudioOperatorActions | null,
): void {
  if (published === next) return
  published = next
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => published
const getServerSnapshot = () => null

/** 当前挂着的操作员的几只手；没有操作员在场时是 `null`。 */
export function useStudioOperatorActions(): StudioOperatorActions | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
