'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

import {
  CIVITAI_LORA_PAGE_SIZE,
  DEFAULT_LORA_CONTENT_TYPE,
  DEFAULT_LORA_NSFW_FILTER,
  isLoraNsfwFilter,
  LORA_LIBRARY_NSFW_STORAGE_KEY,
  type CivitaiLoraBaseModel,
  type CivitaiLoraSort,
  type LoraContentType,
  type LoraNsfwFilter,
} from '@/constants/lora'
import { listCivitaiLoraAssetsAPI } from '@/lib/api-client/lora-assets'
import { deferEffectTask } from '@/lib/defer-effect-task'
import type { CivitaiLoraLibraryItem, CivitaiLoraLibraryResult } from '@/types'

import { useLocalPreference } from '@/hooks/use-local-preference'

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
  /** S2 内容类型筛选（lora-workbench.md §3）。 */
  initialContentType?: LoraContentType
  /**
   * 库 B（桌面，lora-library.md §3）：往下滚着接 —— `loadMore` 把下一段接在后面；
   * 换筛选 / 搜新词时旧结果留在原地（调用方把它变淡），新的第一段到了再整批换掉，
   * ⛔ 不先清成白屏。不给 = 手机那种一页换一页（`nextPage` / `previousPage`）。
   * 只在挂载时读一次。
   */
  accumulate?: boolean
  /** 一段 / 一页几个（库 B 一段 24，手机一页 12）。只在挂载时读一次。 */
  pageSize?: number
}

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
  /** Debounced/committed search term — what the URL sync and the fetch both
   *  key off, as opposed to `search` which tracks every keystroke. */
  debouncedSearch: string
  sort: CivitaiLoraSort
  baseModel: CivitaiLoraBaseModel
  nsfwFilter: LoraNsfwFilter
  contentType: LoraContentType
  setSearch: (value: string) => void
  /** 回车 / 点搜索按钮才真正开始检索——不再每敲一个键搜一次。 */
  submitSearch: () => void
  /**
   * 直接用给定的词开搜，不经过输入框 state。点历史项、类型筛选的「改用搜
   * 索」兜底都属于「我就要搜这个」——用 setSearch + submitSearch 会读到本
   * 次渲染的旧 `search`，搜出上一个词。
   */
  commitSearchTerm: (term: string) => void
  setSort: (value: CivitaiLoraSort) => void
  setBaseModel: (value: CivitaiLoraBaseModel) => void
  setNsfwFilter: (value: LoraNsfwFilter) => void
  setContentType: (value: LoraContentType) => void
  selectItem: (item: CivitaiLoraLibraryItem) => void
  nextPage: () => void
  previousPage: () => void
  /** `accumulate` 下把下一段接在后面（同 `nextPage` 的闸：在取、没有下一段时不动）。 */
  loadMore: () => void
  /** `accumulate` 下正在接下一段（列表底下那一行「正在接着取」）。 */
  isLoadingMore: boolean
  /** `accumulate` 下换筛选 / 搜新词、旧结果还在屏上等新的第一段。 */
  isReplacing: boolean
  refresh: () => Promise<void>
}

// ─── Module-level cache ──────────────────────────────────────────────────
//
// Stale-while-revalidate friend. Keeps last-N (baseModel, sort, search, page)
// → result pages in memory so flicking sort/baseModel/page back and forth
// returns quickly once the next facet/search request resolves.
//
// Module-scoped (not per-hook-instance) so navigating away and back to /lora
// still hits the cache. The index only changes once a day; the 5 min TTL
// just keeps one tab from holding a page forever.

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
  contentType: LoraContentType
  pageSize: number
  page: number
}): string {
  // pageSize 排在筛选之后：一段 24 与一页 12 的第 2 页不是同一批，⛔ 混用缓存；
  // `invalidateCacheForQuery` 按筛选前缀清，照样清得到。
  return [
    params.baseModel,
    params.sort,
    params.search,
    params.nsfwFilter,
    params.contentType,
    params.pageSize,
    params.page,
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
  const [accumulate] = useState(options.accumulate ?? false)
  const [pageSize] = useState(options.pageSize ?? CIVITAI_LORA_PAGE_SIZE)
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
  // "Has a fetch ever resolved for this hook instance?" Starts false and flips
  // true the first time a response is applied (cache hit, network success, or
  // network error). Gates the first-paint loader independently of
  // `isRevalidating`, which only commits true *after* the mount fetch is
  // dispatched via `deferEffectTask` — leaving a window where a request is in
  // flight but `isRevalidating` is still false, so the empty-state branch would
  // render over an in-flight request. See the "first-load loader (no empty-state
  // flash)" regression tests.
  const [hasResolvedOnce, setHasResolvedOnce] = useState(false)
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
  // 分级记住上次选的（owner 2026-09-27，只记在这台浏览器里）；网址里带了
  // `nsfw=` 的深链这一次以网址为准，用户再改就写回偏好。
  const [storedNsfwFilter, storeNsfwFilter] = useLocalPreference(
    LORA_LIBRARY_NSFW_STORAGE_KEY,
  )
  const [nsfwFilterOverride, setNsfwFilterOverride] =
    useState<LoraNsfwFilter | null>(options.initialNsfwFilter ?? null)
  const nsfwFilter: LoraNsfwFilter =
    nsfwFilterOverride ??
    (storedNsfwFilter && isLoraNsfwFilter(storedNsfwFilter)
      ? storedNsfwFilter
      : DEFAULT_LORA_NSFW_FILTER)
  const [contentType, setContentTypeValue] = useState<LoraContentType>(
    options.initialContentType ?? DEFAULT_LORA_CONTENT_TYPE,
  )
  const requestIdRef = useRef(0)
  // requestIdRef 只负责在响应回来时丢弃过期结果；这个 ref 负责把被取代的请求
  // 真的掐掉。
  const inFlightRef = useRef<AbortController | null>(null)
  const paginationPendingRef = useRef(false)

  const applyResult = useCallback(
    (result: CivitaiLoraLibraryResult) => {
      const appending = accumulate && result.page > 1
      if (appending) {
        // 接在后面；同一个 LoRA 只出现一次（翻页期间索引刚同步过、排名挪动时可能重叠）。
        setItems((prev) => {
          const seen = new Set(prev.map((item) => item.id))
          return [...prev, ...result.items.filter((item) => !seen.has(item.id))]
        })
      } else {
        setItems(result.items)
      }
      setTotal(result.total)
      setHasNextPage(result.hasNextPage)
      // 接下一段时选中项还在列表里，⛔ 被新一段的第一项顶掉。
      if (appending) return
      setSelectedItemId((current) => {
        if (current && result.items.some((item) => item.id === current)) {
          return current
        }
        return result.items[0]?.id ?? null
      })
    },
    [accumulate],
  )

  const clearFacetResults = useCallback(() => {
    requestIdRef.current += 1
    inFlightRef.current?.abort()
    inFlightRef.current = null
    // 库 B：旧结果留在屏上（调用方变淡），新的第一段到了 `applyResult` 整批换掉。
    if (!accumulate) {
      setItems([])
      setSelectedItemId(null)
      setTotal(null)
      setHasNextPage(false)
    }
    setError(null)
    setIsRevalidating(true)
  }, [accumulate])

  const refresh = useCallback(async () => {
    const normalizedSearch = search.trim()
    // 输入框里的字还没提交（用户在敲下一个词）——什么都不做。
    // ⚠ 这个守卫必须排在 requestId 自增前面：原来先自增再 return，等于用户
    // 提交后再敲一个字就把在飞的那次请求作废掉，而又不发新请求，结果永远
    // 不回来。改成回车触发后这个窗口从 300ms 变成「用户想敲多久就多久」，
    // 必现。
    if (normalizedSearch !== debouncedSearch) return

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    const activeSearch = debouncedSearch
    const cacheKey = buildCacheKey({
      baseModel,
      sort,
      search: activeSearch,
      nsfwFilter,
      contentType,
      pageSize,
      page,
    })

    const cached = readCache(cacheKey)
    if (cached) {
      applyResult(cached)
      paginationPendingRef.current = false
      setError(null)
      setIsRevalidating(false)
      setHasResolvedOnce(true)
      return
    }

    setIsRevalidating(true)
    setError(null)

    inFlightRef.current?.abort()
    const controller = new AbortController()
    inFlightRef.current = controller

    const response = await listCivitaiLoraAssetsAPI({
      signal: controller.signal,
      page,
      pageSize,
      search: activeSearch || undefined,
      sort,
      baseModel,
      nsfwFilter,
      contentType,
    })
    if (requestIdRef.current !== requestId) return

    if (response.success && response.data) {
      writeCache(cacheKey, response.data)
      applyResult(response.data)
    } else {
      // Keep whatever items we had on screen so a failed request does not
      // turn into a blank wall. Just surface the error so the caller can
      // render a toast/banner.
      setError(response.error ?? t('communityLoadFailed'))
    }
    paginationPendingRef.current = false
    setIsRevalidating(false)
    setHasResolvedOnce(true)
  }, [
    applyResult,
    baseModel,
    contentType,
    debouncedSearch,
    nsfwFilter,
    page,
    pageSize,
    search,
    sort,
    t,
  ])

  /**
   * 把输入框里的字正式变成「在搜的词」。
   *
   * 2026-08-20 从防抖自动提交改成显式提交：每敲一个键就搜一次太浪费。
   */
  const commitSearch = useCallback(
    (term: string) => {
      const trimmed = term.trim()
      if (trimmed === debouncedSearch && (!trimmed || sort === 'Highest Rated'))
        return
      // 先作废在飞请求再改 state：旧的第 6 页响应回来不能盖掉新搜索。
      // requestId 必须先加——abort 会让 fetch 立刻以 success:false 回来，
      // 若不先加，refresh 会把 AbortError 当成真正的加载失败。
      clearFacetResults()
      if (trimmed) setSortValue('Highest Rated')
      setDebouncedSearch(trimmed)
      setPage(1)
    },
    [clearFacetResults, debouncedSearch, sort],
  )

  /** 回车 / 点搜索按钮时调用。 */
  const submitSearch = useCallback(() => {
    commitSearch(search)
  }, [commitSearch, search])

  useEffect(() => {
    return deferEffectTask(() => {
      void refresh()
    })
  }, [refresh])

  // 组件卸载时掐掉在飞请求——离开页面不该继续占着上游。
  useEffect(() => {
    const inFlight = inFlightRef
    return () => {
      inFlight.current?.abort()
      inFlight.current = null
    }
  }, [])

  const setSearch = useCallback(
    (value: string) => {
      setSearchValue(value)
      // 只改输入框的字，不发请求，也不清空当前结果——旧行为是每敲一个键就
      // 清一次列表，白屏 ~300ms(防抖)+600ms(上游) 才回来。现在敲字期间列表
      // 原样留着，直到用户显式提交。
      //
      // 唯一例外：删光了立刻提交空词回到浏览态。用户把字删完却什么都不发
      // 生，界面会显得卡住。放在事件处理里而不是 effect 里——effect 内同步
      // setState 会引发级联渲染（react-hooks/set-state-in-effect）。
      if (value.trim() === '') commitSearch('')
    },
    [commitSearch],
  )

  const setSort = useCallback(
    (value: CivitaiLoraSort) => {
      if (value === sort) return
      setPage(1)
      clearFacetResults()
      setSortValue(value)
    },
    [clearFacetResults, sort],
  )

  const setBaseModel = useCallback(
    (value: CivitaiLoraBaseModel) => {
      if (value === baseModel) return
      setPage(1)
      clearFacetResults()
      setBaseModelValue(value)
    },
    [baseModel, clearFacetResults],
  )

  const setNsfwFilter = useCallback(
    (value: LoraNsfwFilter) => {
      if (value === nsfwFilter) return
      setPage(1)
      clearFacetResults()
      setNsfwFilterOverride(null)
      storeNsfwFilter(value)
    },
    [clearFacetResults, nsfwFilter, storeNsfwFilter],
  )

  const setContentType = useCallback(
    (value: LoraContentType) => {
      if (value === contentType) return
      setPage(1)
      clearFacetResults()
      setContentTypeValue(value)
    },
    [clearFacetResults, contentType],
  )

  const selectItem = useCallback((item: CivitaiLoraLibraryItem) => {
    setSelectedItemId(item.id)
  }, [])

  const nextPage = useCallback(() => {
    if (paginationPendingRef.current || isRevalidating || !hasNextPage) {
      return
    }
    if (total !== null && page * pageSize >= total) {
      return
    }

    const targetPage = page + 1
    paginationPendingRef.current = true
    setIsRevalidating(true)
    setPage(targetPage)
  }, [hasNextPage, isRevalidating, page, pageSize, total])

  const previousPage = useCallback(() => {
    if (paginationPendingRef.current || isRevalidating) return
    if (page <= 1) return
    paginationPendingRef.current = true
    setIsRevalidating(true)
    setPage((current) => Math.max(1, current - 1))
  }, [isRevalidating, page])

  // 「没选就是没选」——不给 `?? items[0]` 兜底（owner 2026-08-07 拍板去掉）。
  //
  // ⚠ 那个兜底害过一次：列表一变（换排序/筛选/翻页/搜索/重拉），旧的
  // selectedItemId 对不上任何一项，selectedItem 就悄悄回落到第一项；调用方若
  // 还持有「详情已展开」的布尔，第一行就凭空变成展开态，用户点它反而是收起
  // ——表现为「第一下点不开」，且只在换过列表之后出现，极难归因。
  // 它买到的唯一好处是投机的：useCivitaiMinedPrompts 只要拿到
  // modelId+modelVersionId 就立刻发请求，等于每次打开库/换筛选都为一个用户
  // 可能永远不点的项打一次 Civitai（而 Civitai 有限流，见 civitai-lora
  // .service 的 429 退避）。消费方（样例图 / 配方 modal / mined prompts）全都
  // 只在展开态下用得到，而展开必然先 selectItem，所以去掉不会让谁变空。
  // 这也让本 hook 与 useHuggingFaceLoraLibrary（局部 state、从无兜底）同源。
  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null

  // First-paint loader: whenever we have nothing to render AND either a fetch
  // is in progress OR no fetch has resolved yet. The `!hasResolvedOnce` half is
  // what closes the mount-flicker gap: the initial fetch is dispatched a
  // macrotask after mount (via `deferEffectTask`), so `isRevalidating` is still
  // false for that first window — without it we'd fall through to the empty
  // state while the very first request is in flight. Once any items exist
  // (incl. stale) this is false and the small revalidation spinner takes over;
  // once the first response resolves empty, `hasResolvedOnce` lets the genuine
  // empty state show.
  const isLoading = items.length === 0 && (isRevalidating || !hasResolvedOnce)

  return {
    items,
    selectedItem,
    total,
    page,
    pageSize,
    hasNextPage,
    isLoading,
    isRevalidating,
    error,
    search,
    debouncedSearch,
    sort,
    baseModel,
    nsfwFilter,
    contentType,
    setSearch,
    submitSearch,
    commitSearchTerm: commitSearch,
    setSort,
    setBaseModel,
    setNsfwFilter,
    setContentType,
    selectItem,
    nextPage,
    previousPage,
    loadMore: nextPage,
    isLoadingMore: accumulate && isRevalidating && page > 1,
    isReplacing: accumulate && isRevalidating && page === 1 && items.length > 0,
    refresh,
  }
}
