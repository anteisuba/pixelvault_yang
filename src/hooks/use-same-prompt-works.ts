'use client'

import { useCallback, useEffect, useState } from 'react'

import { fetchGalleryImages } from '@/lib/api-client'
import type { GenerationRecord } from '@/types'

/** 一次取满（接口单页上限 50）：同一段提示词的公开作品很少过这个数。 */
const SAME_PROMPT_WORKS_LIMIT = 50

/**
 * 画廊提示词卡点开后翻的那一组：和这件提示词一字不差、图与提示词都公开的作品，
 * 不分作者（owner 2026-10-23）。还没拿到时是空的，查看器就只摆这一件。
 */
export function useSamePromptWorks(anchorId: string | null) {
  const [state, setState] = useState<{
    anchorId: string | null
    works: GenerationRecord[]
  }>({ anchorId: null, works: [] })

  useEffect(() => {
    if (!anchorId) return
    let cancelled = false
    void fetchGalleryImages(1, SAME_PROMPT_WORKS_LIMIT, {
      samePromptAs: anchorId,
      includeTotal: false,
    }).then((response) => {
      if (cancelled || !response.success || !response.data) return
      setState({ anchorId, works: response.data.generations })
    })
    return () => {
      cancelled = true
    }
  }, [anchorId])

  /** ♥ 等就地改动：这组里没有的那件不动。 */
  const updateWork = useCallback(
    (id: string, patch: Partial<GenerationRecord>) =>
      setState((prev) => ({
        ...prev,
        works: prev.works.map((work) =>
          work.id === id ? { ...work, ...patch } : work,
        ),
      })),
    [],
  )

  return {
    works: state.anchorId === anchorId ? state.works : [],
    updateWork,
  }
}
