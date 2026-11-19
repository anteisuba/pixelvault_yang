'use client'

import { createContext, useContext, type ReactNode } from 'react'

/**
 * 库整页放进各格工具行的两样（由 `LoraLibraryOverlayView` 给）：`scope` = 分组药丸（「全部 LoRA ·
 * 收藏 · 自训 · 角色」，摆最左）；`note` = 「选给 LoRA 台」那一小句（摆排序前）。
 * 挑选框不给 —— 那边分组在左栏。
 */
interface LoraLibraryScope {
  scope: ReactNode
  note: ReactNode
}

const LoraLibraryScopeContext = createContext<LoraLibraryScope>({
  scope: null,
  note: null,
})

export const LoraLibraryScopeProvider = LoraLibraryScopeContext.Provider

export function useLoraLibraryScope(): LoraLibraryScope {
  return useContext(LoraLibraryScopeContext)
}
