'use client'

import { useCallback, useRef, useState } from 'react'

import type { GenerationRecord } from '@/types'

export interface UseGalleryReturn {
  generations: GenerationRecord[]
  isLoading: boolean
  hasMore: boolean
  error: string | null
  loadMore: () => void
  sentinelRef: React.RefObject<HTMLDivElement | null>
}

export function useGallery(): UseGalleryReturn {
  const [generations] = useState<GenerationRecord[]>([])
  const [isLoading] = useState(false)
  const [hasMore] = useState(false)
  const [error] = useState<string | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadMore = useCallback(() => {}, [])

  return {
    generations,
    isLoading,
    hasMore,
    error,
    loadMore,
    sentinelRef,
  }
}
