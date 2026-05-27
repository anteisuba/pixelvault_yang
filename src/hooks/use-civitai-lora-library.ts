'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  CIVITAI_LORA_PAGE_SIZE,
  type CivitaiLoraBaseModel,
  type CivitaiLoraSort,
} from '@/constants/lora'
import { listCivitaiLoraAssetsAPI } from '@/lib/api-client/lora-assets'
import { deferEffectTask } from '@/lib/defer-effect-task'
import type { CivitaiLoraLibraryItem, CivitaiLoraLibraryResult } from '@/types'

export interface UseCivitaiLoraLibraryReturn {
  items: CivitaiLoraLibraryItem[]
  selectedItem: CivitaiLoraLibraryItem | null
  total: number | null
  page: number
  pageSize: number
  hasNextPage: boolean
  /**
   * True only when there is nothing to show AND we are fetching. UI uses this
   * to render the full-section loader on first paint. After we have any items
   * (including stale ones from a previous query), this is false and
   * `isRevalidating` carries the "fetching in background" signal instead.
   */
  isLoading: boolean
  /**
   * True whenever a fetch is in flight, regardless of whether we already have
   * stale items rendered. Drives the small inline spinner on the search input.
   */
  isRevalidating: boolean
  error: string | null
  search: string
  sort: CivitaiLoraSort
  baseModel: CivitaiLoraBaseModel
  setSearch: (value: string) => void
  setSort: (value: CivitaiLoraSort) => void
  setBaseModel: (value: CivitaiLoraBaseModel) => void
  selectItem: (item: CivitaiLoraLibraryItem) => void
  nextPage: () => void
  previousPage: () => void
  refresh: () => Promise<void>
}

const SEARCH_DEBOUNCE_MS = 300

// ─── Module-level cache ──────────────────────────────────────────────────
//
// Stale-while-revalidate friend. Keeps last-N (baseModel, sort, search, page)
// → result pages in memory so flicking sort/baseModel/page back and forth
// returns instantly without the network or a `setItems([])` flash.
//
// Module-scoped (not per-hook-instance) so navigating away and back to /lora
// still hits the cache. TTL guards against truly stale data — the Next.js
// CDN already caches for 5–15 min, so 5 min here is roughly aligned.

const CACHE_MAX_ENTRIES = 30
const CACHE_TTL_MS = 5 * 60 * 1000

interface CacheEntry {
  expiresAt: number
  result: CivitaiLoraLibraryResult
}

// Insertion-ordered Map gives us LRU: re-insert on hit, evict from front when
// over capacity.
const libraryCache = new Map<string, CacheEntry>()

function buildCacheKey(params: {
  baseModel: CivitaiLoraBaseModel
  sort: CivitaiLoraSort
  search: string
  page: number
  cursor: string | null
}): string {
  return [
    params.baseModel,
    params.sort,
    params.search,
    params.page,
    params.cursor ?? '',
  ].join('|')
}

function readCache(key: string): CivitaiLoraLibraryResult | null {
  const hit = libraryCache.get(key)
  if (!hit) return null
  if (hit.expiresAt < Date.now()) {
    libraryCache.delete(key)
    return null
  }
  // LRU bump: re-insert to move to the most-recent end of insertion order.
  libraryCache.delete(key)
  libraryCache.set(key, hit)
  return hit.result
}

function writeCache(key: string, result: CivitaiLoraLibraryResult): void {
  libraryCache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS })
  while (libraryCache.size > CACHE_MAX_ENTRIES) {
    const oldest = libraryCache.keys().next().value
    if (oldest === undefined) break
    libraryCache.delete(oldest)
  }
}

/**
 * Test-only escape hatch. Call from `beforeEach` so the module-level cache
 * does not leak between specs.
 */
export function __resetCivitaiLibraryCacheForTests(): void {
  libraryCache.clear()
}

export function useCivitaiLoraLibrary(): UseCivitaiLoraLibraryReturn {
  const [items, setItems] = useState<CivitaiLoraLibraryItem[]>([])
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [total, setTotal] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [hasNextPage, setHasNextPage] = useState(false)
  // `isLoading` = "I have nothing to show yet". `isRevalidating` = "a fetch is
  // running, possibly while stale items remain visible". Splitting them lets
  // the section render normal content + a small spinner instead of a white
  // flash every time the search debounce kicks in.
  const [isRevalidating, setIsRevalidating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearchValue] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sort, setSortValue] = useState<CivitaiLoraSort>('Highest Rated')
  const [baseModel, setBaseModelValue] = useState<CivitaiLoraBaseModel>('all')
  const requestIdRef = useRef(0)
  const cursorByPageRef = useRef<Map<number, string | null>>(
    new Map([[1, null]]),
  )

  const applyResult = useCallback((result: CivitaiLoraLibraryResult) => {
    setItems(result.items)
    setTotal(result.total)
    setHasNextPage(result.hasNextPage)
    setSelectedItemId((current) => {
      if (current && result.items.some((item) => item.id === current)) {
        return current
      }
      return result.items[0]?.id ?? null
    })
  }, [])

  const refresh = useCallback(async () => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    const normalizedSearch = search.trim()
    // If the user is still typing (debounce in flight), let the debounce
    // schedule the actual fetch — refresh is also called on every search
    // keystroke via the effect chain, but we only act on the stabilised value.
    if (normalizedSearch !== debouncedSearch) return

    const activeSearch = debouncedSearch
    const cursor = cursorByPageRef.current.get(page) ?? null
    const cacheKey = buildCacheKey({
      baseModel,
      sort,
      search: activeSearch,
      page,
      cursor,
    })

    const cached = readCache(cacheKey)
    if (cached) {
      applyResult(cached)
      if (cached.nextCursor) {
        cursorByPageRef.current.set(page + 1, cached.nextCursor)
      } else {
        cursorByPageRef.current.delete(page + 1)
      }
      setError(null)
      setIsRevalidating(false)
      return
    }

    setIsRevalidating(true)
    setError(null)

    const response = await listCivitaiLoraAssetsAPI({
      page,
      pageSize: CIVITAI_LORA_PAGE_SIZE,
      cursor,
      search: activeSearch || undefined,
      sort,
      baseModel,
    })
    if (requestIdRef.current !== requestId) return

    if (response.success && response.data) {
      if (response.data.nextCursor) {
        cursorByPageRef.current.set(page + 1, response.data.nextCursor)
      } else {
        cursorByPageRef.current.delete(page + 1)
      }
      writeCache(cacheKey, response.data)
      applyResult(response.data)
    } else {
      // Stale-tolerant error mode: keep whatever items we had on screen so the
      // user is not punished with a blank wall when Civitai blips. Just
      // surface the error so the caller can render a toast/banner.
      setError(response.error ?? 'Failed to load Civitai LoRAs')
    }
    setIsRevalidating(false)
  }, [applyResult, baseModel, debouncedSearch, page, search, sort])

  // Debounce search input → committed `debouncedSearch`. Pagination resets to
  // page 1 whenever the active search term actually changes.
  useEffect(() => {
    const trimmed = search.trim()
    if (trimmed === debouncedSearch) return
    const id = setTimeout(() => {
      cursorByPageRef.current = new Map([[1, null]])
      setDebouncedSearch(trimmed)
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [search, debouncedSearch])

  useEffect(() => {
    return deferEffectTask(() => {
      void refresh()
    })
  }, [refresh])

  const setSearch = useCallback((value: string) => {
    setSearchValue(value)
    // Intentionally NOT clearing items or flipping isLoading here. The old
    // behaviour blanked the list on every keystroke, producing a white flash
    // for ~300 ms (debounce) + 600 ms (Civitai) before any pixels came back.
    // Now: stale items stay rendered; the input gets a small spinner via
    // `isRevalidating` until the debounced fetch resolves.
    setIsRevalidating(true)
  }, [])

  const setSort = useCallback(
    (value: CivitaiLoraSort) => {
      if (value === sort) return
      cursorByPageRef.current = new Map([[1, null]])
      setPage(1)
      setSortValue(value)
    },
    [sort],
  )

  const setBaseModel = useCallback(
    (value: CivitaiLoraBaseModel) => {
      if (value === baseModel) return
      cursorByPageRef.current = new Map([[1, null]])
      setPage(1)
      setBaseModelValue(value)
    },
    [baseModel],
  )

  const selectItem = useCallback((item: CivitaiLoraLibraryItem) => {
    setSelectedItemId(item.id)
  }, [])

  const nextPage = useCallback(() => {
    setPage((current) => current + 1)
  }, [])

  const previousPage = useCallback(() => {
    setPage((current) => Math.max(1, current - 1))
  }, [])

  const selectedItem =
    items.find((item) => item.id === selectedItemId) ?? items[0] ?? null

  // First-paint loader: only when we have literally nothing to render AND a
  // fetch is in progress. As soon as any items exist (incl. stale), the UI
  // should keep rendering them and only show the small revalidation spinner.
  const isLoading = items.length === 0 && isRevalidating

  return {
    items,
    selectedItem,
    total,
    page,
    pageSize: CIVITAI_LORA_PAGE_SIZE,
    hasNextPage,
    isLoading,
    isRevalidating,
    error,
    search,
    sort,
    baseModel,
    setSearch,
    setSort,
    setBaseModel,
    selectItem,
    nextPage,
    previousPage,
    refresh,
  }
}
