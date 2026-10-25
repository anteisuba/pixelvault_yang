'use client'

import { useCallback } from 'react'

import { LIBRARY_RAIL_STORAGE_KEY } from '@/constants/studio-shell'
import { useLocalPreference } from '@/hooks/use-local-preference'

/**
 * 库的左栏开着没有（用户 10-25：库的侧边栏要能收起）。七个库同一份、本机记住；
 * 库顶上那颗键切它，各库的左栏读它。默认开着。
 */
export function useLibraryRailOpen(): [boolean, () => void] {
  const [stored, setStored] = useLocalPreference(LIBRARY_RAIL_STORAGE_KEY)
  const open = stored !== 'closed'
  const toggle = useCallback(
    () => setStored(open ? 'closed' : 'open'),
    [open, setStored],
  )
  return [open, toggle]
}
