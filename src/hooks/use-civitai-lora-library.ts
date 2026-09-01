'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

import {
  CIVITAI_LORA_PAGE_SIZE,
  DEFAULT_LORA_CONTENT_TYPE,
  DEFAULT_LORA_NSFW_FILTER,
  type CivitaiLoraBaseModel,
  type CivitaiLoraSort,
  type CivitaiSearchBackend,
  type LoraContentType,
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
  /** S2 内容类型筛选（lora-workbench.md §3）。 */
  initialContentType?: LoraContentType
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
   * 路径时为 true——UI 据此把排序控件降级显示成「排序已降级」。
   */
  sortFellBackToRelevance: boolean
  /**
   * L2 陈旧兜底：这一页来自服务端快照，因为 Civitai 搜索子系统当时不可用。
   * UI 必须显式告诉用户——静默端上旧数据比直接报错更糟。staleFetchedAt 是
   * 这份快照最后一次成功取到的时刻（ISO 字符串）。
   */
  isStale: boolean
  staleFetchedAt: string | null
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
  refresh: () => Promise<void>
}

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
  contentType: LoraContentType
  page: number
  cursor: string | null
}): string {
  return [
    params.baseModel,
    params.sort,
    params.search,
    params.nsfwFilter,
    params.contentType,
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

function invalidateCacheForQuery(params: {
  baseModel: CivitaiLoraBaseModel
  sort: CivitaiLoraSort
  search: string
  nsfwFilter: LoraNsfwFilter
  contentType: LoraContentType
}): void {
  const prefix = [
    params.baseModel,
    params.sort,
    params.search,
    params.nsfwFilter,
    params.contentType,
  ].join('|')
  for (const key of [...libraryCache.keys()]) {
    if (key === prefix || key.startsWith(`${prefix}|`)) {
      libraryCache.delete(key)
    }
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
  const [isStale, setIsStale] = useState(false)
  const [staleFetchedAt, setStaleFetchedAt] = useState<string | null>(null)
  // Bug 修复（类型筛选「下一页不可点」的真根因，见
  // CivitaiLoraLibraryResultSchema.offsetPaginationSupported 的注释）：此前
  // nextPage() 用「有没有输入搜索词」当「后端是否支持按页码直接翻页」的代
  // 理判断——类型筛选场景即使没搜索词也恒走 offset 分页的合并路径，代理
  // 判断失真导致点击下一页静默无效。改为直接读服务端回传的显式信号。
  const [offsetPaginationSupported, setOffsetPaginationSupported] =
    useState(false)
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
  const [nsfwFilter, setNsfwFilterValue] = useState<LoraNsfwFilter>(
    options.initialNsfwFilter ?? DEFAULT_LORA_NSFW_FILTER,
  )
  const [contentType, setContentTypeValue] = useState<LoraContentType>(
    options.initialContentType ?? DEFAULT_LORA_CONTENT_TYPE,
  )
  const requestIdRef = useRef(0)
  // requestIdRef 只负责在响应回来时丢弃过期结果——被取代的请求照样在服务端
  // 跑完。2026-08-19 Civitai 过载时这意味着同一个搜索词并发三条、每条 21–24
  // 秒，对着一个正在卸载的上游把压力乘了三倍。这个 ref 负责真的把它们掐掉。
  const inFlightRef = useRef<AbortController | null>(null)
  const paginationPendingRef = useRef(false)
  const cursorByPageRef = useRef<Map<number, string | null>>(
    new Map([[1, null]]),
  )
  // 一次搜索会话
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
    setIsStale(result.stale ?? false)
    setStaleFetchedAt(result.stale ? (result.fetchedAt ?? null) : null)
    setOffsetPaginationSupported(result.offsetPaginationSupported ?? false)
    // 服务端在降级时可能把深页钳回第 1 页（meilisearch 页码不能套到镜像
    // 语料上）。页码是客户端 state，必须跟结果一起改，否则会显示
    // 「第 6 页 · 41 个 LoRA」配上空列表。
    setPage((current) => (result.page === current ? current : result.page))
    setSelectedItemId((current) => {
      if (current && result.items.some((item) => item.id === current)) {
        return current
      }
      return result.items[0]?.id ?? null
    })
  }, [])

  const clearFacetResults = useCallback(() => {
    requestIdRef.current += 1
    inFlightRef.current?.abort()
    inFlightRef.current = null
    setItems([])
    setSelectedItemId(null)
    setTotal(null)
    setHasNextPage(false)
    setSortFellBackToRelevance(false)
    setOffsetPaginationSupported(false)
    setError(null)
    setIsRevalidating(true)
  }, [])

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
    const cursor = cursorByPageRef.current.get(page) ?? null
    const cacheKey = buildCacheKey({
      baseModel,
      sort,
      search: activeSearch,
      nsfwFilter,
      contentType,
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
      pageSize: CIVITAI_LORA_PAGE_SIZE,
      cursor,
      search: activeSearch || undefined,
      sort,
      baseModel,
      nsfwFilter,
      contentType,
      // Issue C: undefined on the session's first request (free choice,
      // same as today); locked to whatever backend served the previous
      // page for the rest of the session. Harmless no-op when contentType
      // is active — the service routes on contentType first and never
      // reads `source` for that branch.
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
      // 降级快照不进客户端缓存。写进去的话，上游恢复之后用户还要再盯着旧
      // 数据看满 5 分钟的 TTL——兜底数据的寿命必须止于上游恢复那一刻。
      // 同一查询下已经缓存的 live 页也要清掉：服务端把深页钳回第 1 页时
      // setPage(1) 会再触发一次 fetch，否则会命中 5 分钟前的 live 第 1 页，
      // 把刚端上的降级结果盖掉。
      if (response.data.stale) {
        invalidateCacheForQuery({
          baseModel,
          sort,
          search: activeSearch,
          nsfwFilter,
          contentType,
        })
      } else {
        writeCache(cacheKey, response.data)
      }
      applyResult(response.data)
    } else {
      // Stale-tolerant error mode: keep whatever items we had on screen so the
      // user is not punished with a blank wall when Civitai blips. Just
      // surface the error so the caller can render a toast/banner.
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
    search,
    sort,
    t,
  ])

  /**
   * 把输入框里的字正式变成「在搜的词」。
   *
   * 2026-08-20 从防抖自动提交改成显式提交：每敲一个键就打一次上游太浪费，
   * 而且 Civitai 的搜索子系统本来就会主动卸载（见 backend.md 三级降级那
   * 节）——少发几十倍的请求本身就是对上游友好。
   */
  const commitSearch = useCallback(
    (term: string) => {
      const trimmed = term.trim()
      if (trimmed === debouncedSearch) return
      // 先作废在飞请求再改 state：旧的第 6 页响应回来不能盖掉新搜索。
      // requestId 必须先加——abort 会让 fetch 立刻以 success:false 回来，
      // 若不先加，refresh 会把 AbortError 当成真正的加载失败。
      requestIdRef.current += 1
      inFlightRef.current?.abort()
      inFlightRef.current = null
      cursorByPageRef.current = new Map([[1, null]])
      // Issue C: a new search term starts a new session — unlock the
      // backend so the next page 1 is free to pick meilisearch/REST again.
      searchBackendRef.current = null
      setDebouncedSearch(trimmed)
      setPage(1)
      setIsRevalidating(true)
    },
    [debouncedSearch],
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

  const setContentType = useCallback(
    (value: LoraContentType) => {
      if (value === contentType) return
      cursorByPageRef.current = new Map([[1, null]])
      searchBackendRef.current = null
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
    if (total !== null && page * CIVITAI_LORA_PAGE_SIZE >= total) {
      return
    }

    const targetPage = page + 1
    const cursorReady = cursorByPageRef.current.has(targetPage)
    // offsetPaginationSupported 是服务端的显式信号（这次结果是不是走按页码
    // 直接 offset 分页的后端）——不再用「有没有搜索词」当代理判断，类型
    // 筛选浏览（无搜索词）也会正确落进这个分支。sortFellBackToRelevance
    // 仍保留一层防御：REST 回落理论上不会同时置 offsetPaginationSupported，
    // 但两个信号都检查更稳。
    const canUseOffsetPagination =
      offsetPaginationSupported && !sortFellBackToRelevance
    if (!canUseOffsetPagination && !cursorReady) return

    paginationPendingRef.current = true
    setIsRevalidating(true)
    setPage(targetPage)
  }, [
    hasNextPage,
    isRevalidating,
    offsetPaginationSupported,
    page,
    sortFellBackToRelevance,
    total,
  ])

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
    pageSize: CIVITAI_LORA_PAGE_SIZE,
    hasNextPage,
    sortFellBackToRelevance,
    isStale,
    staleFetchedAt,
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
    refresh,
  }
}
