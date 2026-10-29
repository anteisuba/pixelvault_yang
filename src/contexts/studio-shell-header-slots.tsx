'use client'

import { createContext, useContext, type ReactNode } from 'react'

/**
 * 外壳塞进对话头的几颗键（用户 10-26：左栏只管「在哪儿」，历史 · 换人搬进白板头）。
 *
 * ⚠ 走 context 不直接 import：那几颗键住在外壳里，对话头再反过来 import 它们容易成环。
 */
export interface StudioShellHeaderSlots {
  /** 对话记录（第一行「＋ 新对话」）。 */
  history: ReactNode
  /** 头像 + 名字 ▾（点开换人）。 */
  persona: ReactNode
}

const StudioShellHeaderSlotsContext =
  createContext<StudioShellHeaderSlots | null>(null)

export const StudioShellHeaderSlotsProvider =
  StudioShellHeaderSlotsContext.Provider

/** 外壳外面（手机 Sheet、单测）拿到 `null`，头部照旧只画头像。 */
export function useStudioShellHeaderSlots(): StudioShellHeaderSlots | null {
  return useContext(StudioShellHeaderSlotsContext)
}
