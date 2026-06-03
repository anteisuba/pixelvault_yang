'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

import { cloneInspirationAPI, listInspirationsAPI } from '@/lib/api-client'
import type {
  CloneInspirationRequest,
  InspirationRecord,
  InspirationSortBy,
  RecipeRecord,
} from '@/types'

const PAGE_SIZE = 24
const SEARCH_DEBOUNCE_MS = 350

export interface InspirationFilters {
  category: string | null
  query: string
  sortBy: InspirationSortBy
}

const DEFAULT_FILTERS: InspirationFilters = {
  category: null,
  query: '',
  sortBy: 'rank',
}

interface InspirationsState {
  items: InspirationRecord[]
  total: number
  isLoading: boolean
  isLoadingMore: boolean
  error: string | null
}

const INITIAL_STATE: InspirationsState = {
  items: [],
  total: 0,
  isLoading: false,
  isLoadingMore: false,
  error: null,
}

export interface UseInspirationsReturn extends InspirationsState {
  filters: InspirationFilters
  hasMore: boolean
  setCategory: (category: string | null) => void
  setQuery: (query: string) => void
  setSortBy: (sortBy: InspirationSortBy) => void
  resetFilters: () => void
  loadMore: () => Promise<void>
  cloneInspiration: (
    id: string,
    overrides?: CloneInspirationRequest,
  ) => Promise<{ success: boolean; recipe?: RecipeRecord; error?: string }>
}

export function useInspirations(): UseInspirationsReturn {
  const t = useTranslations('PromptLibrary')
  const [filters, setFilters] = useState<InspirationFilters>(DEFAULT_FILTERS)
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [state, setState] = useState<InspirationsState>(INITIAL_STATE)

  // Track the most recent request so a stale response doesn't overwrite
  // a newer one if the user changes filters mid-flight.
  const requestSeqRef = useRef(0)

  // Debounce the search input
  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedQuery(filters.query.trim())
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [filters.query])

  // Effective query that drives the fetch — debounced search + immediate other filters
  const effectiveKey = useMemo(
    () =>
      JSON.stringify({
        category: filters.category,
        query: debouncedQuery,
        sortBy: filters.sortBy,
      }),
    [filters.category, filters.sortBy, debouncedQuery],
  )

  // Initial / filter-change fetch
  useEffect(() => {
    const seq = ++requestSeqRef.current
    setState((prev) => ({ ...prev, isLoading: true, error: null }))

    void listInspirationsAPI({
      category: filters.category ?? undefined,
      query: debouncedQuery || undefined,
      sortBy: filters.sortBy,
      limit: PAGE_SIZE,
      offset: 0,
    }).then((result) => {
      if (seq !== requestSeqRef.current) return // stale
      if (result.success && result.data) {
        setState({
          items: result.data.inspirations,
          total: result.data.total,
          isLoading: false,
          isLoadingMore: false,
          error: null,
        })
      } else {
        setState({
          items: [],
          total: 0,
          isLoading: false,
          isLoadingMore: false,
          error: result.error ?? t('inspirationLoadFailed'),
        })
      }
    })
    // effectiveKey already encodes category/sortBy/debouncedQuery
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveKey])

  const loadMore = useCallback(async () => {
    setState((prev) => {
      if (prev.isLoading || prev.isLoadingMore) return prev
      if (prev.items.length >= prev.total) return prev
      return { ...prev, isLoadingMore: true, error: null }
    })

    const seq = ++requestSeqRef.current
    const offset = state.items.length

    const result = await listInspirationsAPI({
      category: filters.category ?? undefined,
      query: debouncedQuery || undefined,
      sortBy: filters.sortBy,
      limit: PAGE_SIZE,
      offset,
    })

    if (seq !== requestSeqRef.current) return // stale

    setState((prev) => {
      if (result.success && result.data) {
        return {
          items: [...prev.items, ...result.data.inspirations],
          total: result.data.total,
          isLoading: false,
          isLoadingMore: false,
          error: null,
        }
      }
      return {
        ...prev,
        isLoadingMore: false,
        error: result.error ?? t('inspirationLoadMoreFailed'),
      }
    })
  }, [debouncedQuery, filters.category, filters.sortBy, state.items.length, t])

  const setCategory = useCallback((category: string | null) => {
    setFilters((prev) => ({ ...prev, category }))
  }, [])

  const setQuery = useCallback((query: string) => {
    setFilters((prev) => ({ ...prev, query }))
  }, [])

  const setSortBy = useCallback((sortBy: InspirationSortBy) => {
    setFilters((prev) => ({ ...prev, sortBy }))
  }, [])

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS)
  }, [])

  const cloneInspiration = useCallback(
    async (id: string, overrides: CloneInspirationRequest = {}) => {
      const result = await cloneInspirationAPI(id, overrides)
      if (result.success && result.data) {
        return { success: true as const, recipe: result.data }
      }
      return {
        success: false as const,
        error: result.error ?? t('inspirationCloneFailed'),
      }
    },
    [t],
  )

  const hasMore = state.items.length < state.total

  return {
    ...state,
    filters,
    hasMore,
    setCategory,
    setQuery,
    setSortBy,
    resetFilters,
    loadMore,
    cloneInspiration,
  }
}
