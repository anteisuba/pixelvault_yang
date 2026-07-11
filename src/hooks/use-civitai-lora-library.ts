'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

import {
  CIVITAI_LORA_PAGE_SIZE,
  DEFAULT_LORA_NSFW_FILTER,
  type CivitaiLoraBaseModel,
  type CivitaiLoraSort,
  type CivitaiSearchBackend,
  type LoraNsfwFilter,
} from '@/constants/lora'
import { listCivitaiLoraAssetsAPI } from '@/lib/api-client/lora-assets'
import { deferEffectTask } from '@/lib/defer-effect-task'
import type { CivitaiLoraLibraryItem, CivitaiLoraLibraryResult } from '@/types'

export interface UseCivitaiLoraLibraryOptions {
  /**
   * Seed values for the URL-deep-link filters (P1-5 方案 A). Caller parses
   * `family`/`q`/`sort`/`nsfw` off `useSearchParams()`, whitelist-validates
   * them, and passes the result here so a pasted deep link renders the right
   * filters on first paint. Only read once (lazy `useState` initializer) —
   * this hook does not re-sync from the URL after mount; the caller owns
   * pushing filter changes back to the URL via the plain setters below.
   */
  initialBaseModel?: CivitaiLoraBaseModel
  initialSort?: CivitaiLoraSort
  initialSearch?: string
  initialNsfwFilter?: LoraNsfwFilter
}

export interface UseCivitaiLoraLibraryReturn {
  items: CivitaiLoraLibraryItem[]
  selectedItem: CivitaiLoraLibraryItem | null
  total: number | null
  page: number
  pageSize: number
  hasNextPage: boolean
  /**
   * B11：搜索路径的 civitai meilisearch 端点挂了、回落到忽略 sort 的 REST
   * 路径时为 true——UI 据此把排序控件降级显示成「按相关性」。
   */
  sortFellBackToRelevance: boolean
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
  /** Debounced/committed search term — what the URL sync and the fetch both
   *  key off, as opposed to `search` which tracks every keystroke. */
  debouncedSearch: string
  sort: CivitaiLoraSort
  baseModel: CivitaiLoraBaseModel
  nsfwFilter: LoraNsfwFilter
  setSearch: (value: string) => void
  setSort: (value: CivitaiLoraSort) => void
  setBaseModel: (value: CivitaiLoraBaseModel) => void
  setNsfwFilter: (value: LoraNsfwFilter) => void
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
// returns quickly once the next facet/search request resolves.
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
  nsfwFilter: LoraNsfwFilter
  page: number
  cursor: string | null
}): string {
  return [
    params.baseModel,
    params.sort,
    params.search,
    params.nsfwFilter,
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

export function useCivitaiLoraLibrary(
  options: UseCivitaiLoraLibraryOptions = {},
): UseCivitaiLoraLibraryReturn {
  const t = useTranslations('LoraWorkbench')
  const [items, setItems] = useState<CivitaiLoraLibraryItem[]>([])
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [total, setTotal] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [hasNextPage, setHasNextPage] = useState(false)
  const [sortFellBackToRelevance, setSortFellBackToRelevance] = useState(false)
  // `isLoading` = "I have nothing to show yet". `isRevalidating` = "a fetch is
  // running, possibly while stale items remain visible". Splitting them lets
  // the section render normal content + a small spinner instead of a white
  // flash every time the search debounce kicks in.
  const [isRevalidating, setIsRevalidating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearchValue] = useState(options.initialSearch ?? '')
  const [debouncedSearch, setDebouncedSearch] = useState(
    options.initialSearch ?? '',
  )
  const [sort, setSortValue] = useState<CivitaiLoraSort>(
    options.initialSort ?? 'Highest Rated',
  )
  const [baseModel, setBaseModelValue] = useState<CivitaiLoraBaseModel>(
    options.initialBaseModel ?? 'all',
  )
  const [nsfwFilter, setNsfwFilterValue] = useState<LoraNsfwFilter>(
    options.initialNsfwFilter ?? DEFAULT_LORA_NSFW_FILTER,
  )
  const requestIdRef = useRef(0)
  const paginationPendingRef = useRef(false)
  const cursorByPageRef = useRef<Map<number, string | null>>(
    new Map([[1, null]]),
  )
  // Issue C（docs/plans/lora-search-image-audit-2026-07.md）：一次搜索会话
  // 内锁定 meilisearch/REST 后端选择。首页拿到结果后写入这里；第 2+ 页把
  // 它原样回传给服务端，防止会话中途换后端打乱 page↔cursor 分页契约（两
  // 条路径分页范式不同——meilisearch=offset 靠 page 号，REST 回落=cursor
  // scan 靠 cursorByPageRef）。null = 尚未锁定（自由选择，等同今天行为）。
  // 只在 debouncedSearch 非空时写入/读取——浏览模式永远走 REST，没有需要
  // 锁定的选择。随 cursorByPageRef 一起在每个新会话起点重置（搜索词/
  // baseModel/sort/nsfwFilter 变化）。
  const searchBackendRef = useRef<CivitaiSearchBackend | null>(null)

  const applyResult = useCallback((result: CivitaiLoraLibraryResult) => {
    setItems(result.items)
    setTotal(result.total)
    setHasNextPage(result.hasNextPage)
    setSortFellBackToRelevance(result.sortFellBackToRelevance ?? false)
    setSelectedItemId((current) => {
      if (current && result.items.some((item) => item.id === current)) {
        return current
      }
      return result.items[0]?.id ?? null
    })
  }, [])

  const clearFacetResults = useCallback(() => {
    requestIdRef.current += 1
    setItems([])
    setSelectedItemId(null)
    setTotal(null)
    setHasNextPage(false)
    setSortFellBackToRelevance(false)
    setError(null)
    setIsRevalidating(true)
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
      nsfwFilter,
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
      // Issue C: keep the backend lock in sync even on a cache hit — a
      // cached entry still carries which backend actually served it.
      if (activeSearch) {
        searchBackendRef.current = cached.sortFellBackToRelevance
          ? 'rest'
          : 'meilisearch'
      }
      paginationPendingRef.current = false
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
      nsfwFilter,
      // Issue C: undefined on the session's first request (free choice,
      // same as today); locked to whatever backend served the previous
      // page for the rest of the session.
      source: activeSearch
        ? (searchBackendRef.current ?? undefined)
        : undefined,
    })
    if (requestIdRef.current !== requestId) return

    if (response.success && response.data) {
      if (response.data.nextCursor) {
        cursorByPageRef.current.set(page + 1, response.data.nextCursor)
      } else {
        cursorByPageRef.current.delete(page + 1)
      }
      // Issue C: lock the backend from this response. sortFellBackToRelevance
      // is only ever true when the server fell back to REST for a search
      // request, so absence (undefined/false) means meilisearch served it.
      if (activeSearch) {
        searchBackendRef.current = response.data.sortFellBackToRelevance
          ? 'rest'
          : 'meilisearch'
      }
      writeCache(cacheKey, response.data)
      applyResult(response.data)
    } else {
      // Stale-tolerant error mode: keep whatever items we had on screen so the
      // user is not punished with a blank wall when Civitai blips. Just
      // surface the error so the caller can render a toast/banner.
      setError(response.error ?? t('communityLoadFailed'))
    }
    paginationPendingRef.current = false
    setIsRevalidating(false)
  }, [
    applyResult,
    baseModel,
    debouncedSearch,
    nsfwFilter,
    page,
    search,
    sort,
    t,
  ])

  // Debounce search input → committed `debouncedSearch`. Pagination resets to
  // page 1 whenever the active search term actually changes.
  useEffect(() => {
    const trimmed = search.trim()
    if (trimmed === debouncedSearch) return
    const id = setTimeout(() => {
      cursorByPageRef.current = new Map([[1, null]])
      // Issue C: a new search term starts a new session — unlock the
      // backend so the next page 1 is free to pick meilisearch/REST again.
      searchBackendRef.current = null
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
      // Issue C: facet change starts a new session — unlock the backend.
      searchBackendRef.current = null
      setPage(1)
      clearFacetResults()
      setSortValue(value)
    },
    [clearFacetResults, sort],
  )

  const setBaseModel = useCallback(
    (value: CivitaiLoraBaseModel) => {
      if (value === baseModel) return
      cursorByPageRef.current = new Map([[1, null]])
      searchBackendRef.current = null
      setPage(1)
      clearFacetResults()
      setBaseModelValue(value)
    },
    [baseModel, clearFacetResults],
  )

  const setNsfwFilter = useCallback(
    (value: LoraNsfwFilter) => {
      if (value === nsfwFilter) return
      cursorByPageRef.current = new Map([[1, null]])
      searchBackendRef.current = null
      setPage(1)
      clearFacetResults()
      setNsfwFilterValue(value)
    },
    [clearFacetResults, nsfwFilter],
  )

  const selectItem = useCallback((item: CivitaiLoraLibraryItem) => {
    setSelectedItemId(item.id)
  }, [])

  const nextPage = useCallback(() => {
    if (paginationPendingRef.current || isRevalidating || !hasNextPage) {
      return
    }

    const targetPage = page + 1
    const cursorReady = cursorByPageRef.current.has(targetPage)
    const canUseOffsetPagination =
      debouncedSearch.trim().length > 0 && !sortFellBackToRelevance
    if (!canUseOffsetPagination && !cursorReady) return

    paginationPendingRef.current = true
    setIsRevalidating(true)
    setPage(targetPage)
  }, [
    debouncedSearch,
    hasNextPage,
    isRevalidating,
    page,
    sortFellBackToRelevance,
  ])

  const previousPage = useCallback(() => {
    if (paginationPendingRef.current || isRevalidating) return
    if (page <= 1) return
    paginationPendingRef.current = true
    setIsRevalidating(true)
    setPage((current) => Math.max(1, current - 1))
  }, [isRevalidating, page])

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
    sortFellBackToRelevance,
    isLoading,
    isRevalidating,
    error,
    search,
    debouncedSearch,
    sort,
    baseModel,
    nsfwFilter,
    setSearch,
    setSort,
    setBaseModel,
    setNsfwFilter,
    selectItem,
    nextPage,
    previousPage,
    refresh,
  }
}
