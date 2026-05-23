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
  isLoading: boolean
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

export function useCivitaiLoraLibrary(): UseCivitaiLoraLibraryReturn {
  const [items, setItems] = useState<CivitaiLoraLibraryItem[]>([])
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [total, setTotal] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [hasNextPage, setHasNextPage] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearchValue] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sort, setSortValue] = useState<CivitaiLoraSort>('Highest Rated')
  const [baseModel, setBaseModelValue] = useState<CivitaiLoraBaseModel>('all')
  const requestIdRef = useRef(0)
  const cursorByPageRef = useRef<Map<number, string | null>>(
    new Map([[1, null]]),
  )

  const resetLibraryForFilterChange = useCallback(() => {
    requestIdRef.current += 1
    cursorByPageRef.current = new Map([[1, null]])
    setItems([])
    setTotal(null)
    setHasNextPage(false)
    setSelectedItemId(null)
    setError(null)
    setIsLoading(true)
    setPage(1)
  }, [])

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
    setIsLoading(true)
    setError(null)
    const normalizedSearch = search.trim()
    if (normalizedSearch !== debouncedSearch) return
    const activeSearch = debouncedSearch.trim()
    const cursor = cursorByPageRef.current.get(page) ?? null

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
      applyResult(response.data)
    } else {
      setItems([])
      setTotal(null)
      setHasNextPage(false)
      setSelectedItemId(null)
      setError(response.error ?? 'Failed to load Civitai LoRAs')
    }
    setIsLoading(false)
  }, [applyResult, baseModel, debouncedSearch, page, search, sort])

  useEffect(() => {
    const id = setTimeout(() => {
      cursorByPageRef.current = new Map([[1, null]])
      setDebouncedSearch(search.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(id)
  }, [search])

  useEffect(() => {
    return deferEffectTask(() => {
      void refresh()
    })
  }, [refresh])

  const setSearch = useCallback(
    (value: string) => {
      setSearchValue(value)
      if (value.trim() !== debouncedSearch) {
        resetLibraryForFilterChange()
      }
    },
    [debouncedSearch, resetLibraryForFilterChange],
  )

  const setSort = useCallback(
    (value: CivitaiLoraSort) => {
      if (value === sort) return
      resetLibraryForFilterChange()
      setSortValue(value)
    },
    [resetLibraryForFilterChange, sort],
  )

  const setBaseModel = useCallback(
    (value: CivitaiLoraBaseModel) => {
      if (value === baseModel) return
      resetLibraryForFilterChange()
      setBaseModelValue(value)
    },
    [baseModel, resetLibraryForFilterChange],
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

  return {
    items,
    selectedItem,
    total,
    page,
    pageSize: CIVITAI_LORA_PAGE_SIZE,
    hasNextPage,
    isLoading,
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
