'use client'

import { useMemo } from 'react'

export interface SplitableModelOption {
  sourceType: string
  freeTier?: boolean
}

export interface SplitModelOptions<T extends SplitableModelOption> {
  saved: T[]
  platform: T[]
  locked: T[]
}

export function useSplitModelOptions<T extends SplitableModelOption>(
  options: T[],
): SplitModelOptions<T> {
  return useMemo(() => {
    const saved: T[] = []
    const platform: T[] = []
    const locked: T[] = []
    for (const opt of options) {
      if (opt.sourceType === 'saved') {
        saved.push(opt)
      } else if (opt.freeTier) {
        platform.push(opt)
      } else {
        locked.push(opt)
      }
    }
    return { saved, platform, locked }
  }, [options])
}
