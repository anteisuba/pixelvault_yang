'use client'

import { useMemo } from 'react'

export interface SplitableModelOption {
  sourceType: string
  freeTier?: boolean
  /**
   * Provider-level key coverage: the option's adapter has an active key, so it
   * is runnable even without a key row bound to this exact model id.
   */
  providerKeyId?: string
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
        // Platform quota outranks spending the user's own key.
        platform.push(opt)
      } else if (opt.providerKeyId) {
        // Reachable through an existing provider key — "configured", not locked.
        saved.push(opt)
      } else {
        locked.push(opt)
      }
    }
    return { saved, platform, locked }
  }, [options])
}
