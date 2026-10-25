'use client'

import { createContext, useCallback, useContext } from 'react'

import { LIBRARY_RAIL_STORAGE_KEY } from '@/constants/studio-shell'
import { useLocalPreference } from '@/hooks/use-local-preference'

/**
 * 挑选框里（LoRA / 音色）没有收起键，左栏一直开着 —— ⛔ 跟着库整页收起的那份走
 *（10-25 用户在库里收起过左栏，挑 LoRA 框里就看不到收藏）。挑选框用它包一层。
 */
export const LibraryRailPinnedContext = createContext(false)

/**
 * 库的左栏开着没有（用户 10-25：库的侧边栏要能收起）。七个库同一份、本机记住；
 * 库顶上那颗键切它，各库的左栏读它。默认开着。
 */
export function useLibraryRailOpen(): [boolean, () => void] {
  const [stored, setStored] = useLocalPreference(LIBRARY_RAIL_STORAGE_KEY)
  const pinned = useContext(LibraryRailPinnedContext)
  const open = pinned || stored !== 'closed'
  const toggle = useCallback(
    () => setStored(open ? 'closed' : 'open'),
    [open, setStored],
  )
  return [open, toggle]
}
