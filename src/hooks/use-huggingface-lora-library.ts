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
  isLoading: boolean
  isRevalidating: boolean
  error: string | null
  setSearch: (value: string) => void
  setBaseModelFamily: (value: HuggingFaceLoraFamily) => void
  setSort: (value: HuggingFaceLoraSort) => void
  setContentType: (value: LoraContentType) => void
  nextPage: () => void
  previousPage: () => void
  refresh: () => Promise<void>
}

/**
 * Client-side state for the public HF source. The API returns repositories;
 * each item already contains the exact SafeTensors files that can be imported.
 */
export function useHuggingFaceLoraLibrary(
  options: UseHuggingFaceLoraLibraryOptions = {},
): UseHuggingFaceLoraLibraryReturn {
  const [items, setItems] = useState<HuggingFaceLoraSearchItem[]>([])
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
      setItems(response.data.items)
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
  }, [baseModelFamily, contentType, debouncedSearch, options.limit, page, sort])

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
    isLoading: items.length === 0 && isRevalidating,
    isRevalidating,
    error,
    setSearch,
    setBaseModelFamily,
    setSort,
    setContentType,
    nextPage,
    previousPage,
    refresh,
  }
}
