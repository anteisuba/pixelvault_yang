'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import type { GenerationRecord } from '@/types'
import { fetchGalleryImages } from '@/lib/api-client'
interface UseGalleryReturn {
  generations: GenerationRecord[]
  isLoading: boolean
  hasMore: boolean
  error: string | null
  loadMore: () => void

  /** Ref to attach to the sentinel element for infinite scroll */
  sentinelRef: React.RefObject<HTMLDivElement | null>
}
