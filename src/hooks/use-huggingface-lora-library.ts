'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  DEFAULT_HUGGINGFACE_LORA_SORT,
  DEFAULT_LORA_CONTENT_TYPE,
  HUGGINGFACE_LORA_DEFAULT_FAMILY,
  type HuggingFaceLoraFamily,
  type HuggingFaceLoraSort,
  type LoraContentType,
} from '@/constants/lora'
import { listHuggingFaceLoraAssetsAPI } from '@/lib/api-client/lora-assets'
import { deferEffectTask } from '@/lib/defer-effect-task'
import type { HuggingFaceLoraSearchItem } from '@/types'

const SEARCH_DEBOUNCE_MS = 300

export interface UseHuggingFaceLoraLibraryOptions {
  initialSearch?: string
  initialBaseModelFamily?: HuggingFaceLoraFamily
  initialSort?: HuggingFaceLoraSort
  /** S2 内容类型筛选（lora-workbench.md §3）。 */
  initialContentType?: LoraContentType
  limit?: number
  /**
   * 库 B（桌面，lora-library.md §3）：往下滚着接 —— `loadMore` 把下一段接在后面；
   * 换筛选 / 搜新词时旧结果留在原地（调用方把它变淡），新的第一段到了整批换掉。
   * 不给 = 手机那种一页换一页。只在挂载时读一次。
   */
  accumulate?: boolean
}

export interface UseHuggingFaceLoraLibraryReturn {
  items: HuggingFaceLoraSearchItem[]
  search: string
  /** Debounced/committed search term — what the URL sync and the fetch both
   *  key off, mirroring useCivitaiLoraLibrary's split (S1 统一外壳，两个
   *  tab 的 URL 写回都用这个而不是逐字符更新的 `search`）。 */
  debouncedSearch: string
  baseModelFamily: HuggingFaceLoraFamily
  sort: HuggingFaceLoraSort
  contentType: LoraContentType
  total: number | null
  page: number
  hasNextPage: boolean
  /**
   * 当前这批 `items` **回到浏览器的那一刻**（ISO）。
   *
   * ⭐ 存在的理由只有一个：导入时要写进 `LoraAsset.sourceSnapshot.retrievedAt`
   * ——「卡上写的作者/许可是那一刻上游说的」。用点击时刻代替是错的（用户可能翻了
   * 十分钟），而这个时刻只有发请求的这一层知道。
   */
  retrievedAt: string
  /**
   * 某个仓库**那一批**回到浏览器的时刻。`accumulate` 下前后几段是不同时刻取回的，
   * 导入时按条目取这一个（⛔ 拿最后一段的时刻冒充前面几段的）。
   */
  retrievedAtFor: (repoId: string) => string
  isLoading: boolean
  isRevalidating: boolean
  error: string | null
  setSearch: (value: string) => void
  /**
   * 回车 / 点放大镜：这个词**当场**生效（不等防抖）。库 B 的输入框自己持有正在敲的字，
   * 只在提交时交给这里 —— 敲字期间 ⛔ 发请求。
   */
  commitSearch: (term: string) => void
  setBaseModelFamily: (value: HuggingFaceLoraFamily) => void
  setSort: (value: HuggingFaceLoraSort) => void
  setContentType: (value: LoraContentType) => void
  nextPage: () => void
  previousPage: () => void
  /** `accumulate` 下把下一段接在后面（同 `nextPage` 的闸）。 */
  loadMore: () => void
  /** `accumulate` 下正在接下一段。 */
  isLoadingMore: boolean
  /** `accumulate` 下换筛选 / 搜新词、旧结果还在屏上等新的第一段。 */
  isReplacing: boolean
  refresh: () => Promise<void>
}

/**
 * Client-side state for the public HF source. The API returns repositories;
 * each item already contains the exact SafeTensors files that can be imported.
 */
export function useHuggingFaceLoraLibrary(
  options: UseHuggingFaceLoraLibraryOptions = {},
): UseHuggingFaceLoraLibraryReturn {
  const [accumulate] = useState(options.accumulate ?? false)
  const [items, setItems] = useState<HuggingFaceLoraSearchItem[]>([])
  // 首帧的值只在 items 还空着时存在（那时无从导入），首次成功拉取立即覆盖。
  const [retrievedAt, setRetrievedAt] = useState(() => new Date().toISOString())
  const [retrievedAtByRepo, setRetrievedAtByRepo] = useState<
    ReadonlyMap<string, string>
  >(() => new Map())
  const [search, setSearchValue] = useState(options.initialSearch ?? '')
  const [debouncedSearch, setDebouncedSearch] = useState(
    options.initialSearch ?? '',
  )
  const [baseModelFamily, setBaseModelFamilyValue] =
    useState<HuggingFaceLoraFamily>(
      options.initialBaseModelFamily ?? HUGGINGFACE_LORA_DEFAULT_FAMILY,
    )
  const [sort, setSortValue] = useState<HuggingFaceLoraSort>(
    options.initialSort ?? DEFAULT_HUGGINGFACE_LORA_SORT,
  )
  const [contentType, setContentTypeValue] = useState<LoraContentType>(
    options.initialContentType ?? DEFAULT_LORA_CONTENT_TYPE,
  )
  const [total, setTotal] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [hasNextPage, setHasNextPage] = useState(false)
  const [isRevalidating, setIsRevalidating] = useState(false)
  // "Has a fetch ever resolved for this hook instance?" Gates the first-paint
  // loader independently of `isRevalidating`, which only commits true *after*
  // the mount fetch is dispatched via `deferEffectTask` — closing the window
  // where the first request is in flight but the empty-state branch would
  // render over it. Mirrors useCivitaiLoraLibrary. See the regression test.
  const [hasResolvedOnce, setHasResolvedOnce] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)
  const cursorsByPageRef = useRef<Map<number, string | undefined>>(
    new Map([[1, undefined]]),
  )

  const refresh = useCallback(async () => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setIsRevalidating(true)
    setError(null)

    const response = await listHuggingFaceLoraAssetsAPI({
      search: debouncedSearch || undefined,
      baseModelFamily,
      sort,
      contentType,
      limit: options.limit,
      page,
      cursor: cursorsByPageRef.current.get(page),
    })

    if (requestIdRef.current !== requestId) return

    if (response.success && response.data) {
      const incoming = response.data.items
      const appending = accumulate && page > 1
      if (appending) {
        // 接在后面；同一个仓库只出现一次。
        setItems((prev) => {
          const seen = new Set(prev.map((item) => item.repoId))
          return [...prev, ...incoming.filter((item) => !seen.has(item.repoId))]
        })
      } else {
        setItems(incoming)
      }
      // 与 items 同一跳落地 —— 快照里的「上游是什么时候这么说的」就是这一刻。
      const now = new Date().toISOString()
      setRetrievedAt(now)
      setRetrievedAtByRepo((prev) => {
        const next = new Map(appending ? prev : [])
        for (const item of incoming) {
          if (!next.has(item.repoId)) next.set(item.repoId, now)
        }
        return next
      })
      setTotal(response.data.total)
      setHasNextPage(response.data.hasNextPage)
      if (response.data.nextCursor) {
        cursorsByPageRef.current.set(page + 1, response.data.nextCursor)
      } else {
        cursorsByPageRef.current.delete(page + 1)
      }
    } else {
      setError(response.error ?? 'Hugging Face LoRA search failed')
    }
    setIsRevalidating(false)
    setHasResolvedOnce(true)
  }, [
    accumulate,
    baseModelFamily,
    contentType,
    debouncedSearch,
    options.limit,
    page,
    sort,
  ])

  useEffect(() => {
    const trimmed = search.trim()
    if (trimmed === debouncedSearch) return
    const id = setTimeout(() => {
      cursorsByPageRef.current = new Map([[1, undefined]])
      setPage(1)
      setDebouncedSearch(trimmed)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [debouncedSearch, search])

  useEffect(() => {
    return deferEffectTask(() => {
      void refresh()
    })
  }, [refresh])

  const setSearch = useCallback((value: string) => {
    setSearchValue(value)
    setIsRevalidating(true)
  }, [])

  const commitSearch = useCallback(
    (term: string) => {
      setSearchValue(term)
      const trimmed = term.trim()
      if (trimmed === debouncedSearch) return
      cursorsByPageRef.current = new Map([[1, undefined]])
      setPage(1)
      setDebouncedSearch(trimmed)
      setIsRevalidating(true)
    },
    [debouncedSearch],
  )

  const retrievedAtFor = useCallback(
    (repoId: string) => retrievedAtByRepo.get(repoId) ?? retrievedAt,
    [retrievedAt, retrievedAtByRepo],
  )

  const setBaseModelFamily = useCallback((value: HuggingFaceLoraFamily) => {
    cursorsByPageRef.current = new Map([[1, undefined]])
    setBaseModelFamilyValue(value)
    setPage(1)
    setIsRevalidating(true)
  }, [])

  const setSort = useCallback((value: HuggingFaceLoraSort) => {
    cursorsByPageRef.current = new Map([[1, undefined]])
    setSortValue(value)
    setPage(1)
    setIsRevalidating(true)
  }, [])

  const setContentType = useCallback((value: LoraContentType) => {
    cursorsByPageRef.current = new Map([[1, undefined]])
    setContentTypeValue(value)
    setPage(1)
    setIsRevalidating(true)
  }, [])

  const nextPage = useCallback(() => {
    if (isRevalidating || !hasNextPage) return
    setIsRevalidating(true)
    setPage((current) => current + 1)
  }, [hasNextPage, isRevalidating])

  const previousPage = useCallback(() => {
    if (isRevalidating || page <= 1) return
    setIsRevalidating(true)
    setPage((current) => Math.max(1, current - 1))
  }, [isRevalidating, page])

  return {
    items,
    search,
    debouncedSearch,
    baseModelFamily,
    sort,
    contentType,
    total,
    page,
    hasNextPage,
    retrievedAt,
    retrievedAtFor,
    // See `hasResolvedOnce` above — the `!hasResolvedOnce` half keeps the
    // loader up during the initial mount fetch, before `isRevalidating` has
    // committed true, so the empty state never flashes over an in-flight
    // first request.
    isLoading: items.length === 0 && (isRevalidating || !hasResolvedOnce),
    isRevalidating,
    error,
    setSearch,
    commitSearch,
    setBaseModelFamily,
    setSort,
    setContentType,
    nextPage,
    previousPage,
    loadMore: nextPage,
    isLoadingMore: accumulate && isRevalidating && page > 1,
    isReplacing: accumulate && isRevalidating && page === 1 && items.length > 0,
    refresh,
  }
}
