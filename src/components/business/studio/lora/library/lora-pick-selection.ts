'use client'

import { createContext, useContext } from 'react'

/** 挑选框里圈中的一把：挂它的那一下由那一格自己给（收藏 / 库各有各的挂法）。 */
export interface LoraPickEntry {
  readonly id: string
  readonly mount: () => unknown
}

export interface LoraPickSelection {
  isSelected: (id: string) => boolean
  toggle: (entry: LoraPickEntry) => void
}

const LoraPickSelectionContext = createContext<LoraPickSelection | null>(null)

/**
 * 挑选框（ui-spec ㉔，样件 E S24）包这一层：库的格子右上角换成圈，圈中了攒着，黑条
 * 「挂上 N 个」一次挂完。不在框里 = `null`，格子照旧（「更多」里挂载、✓ 已挂）。
 */
export const LoraPickSelectionProvider = LoraPickSelectionContext.Provider

export function useLoraPickSelection(): LoraPickSelection | null {
  return useContext(LoraPickSelectionContext)
}
