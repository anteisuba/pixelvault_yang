'use client'

import { useCallback, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { ASSET_PICKER_CACHE_TTL_MS } from '@/constants/assets-grid'
import { fetchAssetSectionCounts } from '@/lib/api-client/gallery'
import type {
  AssetSectionCounts,
  OutputTypeValue,
  ProjectRecord,
} from '@/types'
import { ApiClientError } from '@/lib/api-client/error-fields'
import { projectsQuery } from '@/lib/projects-query'
import { queryClient } from '@/lib/query-client'

interface CacheEntry<T> {
  data?: T
  expiresAt: number
  pending?: Promise<T>
}

const countsCache = new Map<string, CacheEntry<AssetSectionCounts>>()

const NO_PROJECTS: ProjectRecord[] = []

function loadCached<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  fetcher: () => Promise<T>,
  force: boolean,
): Promise<T> {
  const cached = cache.get(key)
  if (cached?.pending) {
    if (!force) return cached.pending
    return cached.pending
      .catch(() => undefined)
      .then(() => loadCached(cache, key, fetcher, true))
  }
  if (!force && cached?.data !== undefined && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.data)
  }
  const entry = cached ?? { expiresAt: 0 }
  const request = fetcher()
    .then((data) => {
      entry.data = data
      entry.expiresAt = Date.now() + ASSET_PICKER_CACHE_TTL_MS
      return data
    })
    .finally(() => {
      if (entry.pending === request) delete entry.pending
    })
  entry.pending = request
  cache.delete(key)
  cache.set(key, entry)
  while (cache.size > 8) cache.delete(cache.keys().next().value!)
  return request
}

export function useAssetPickerNavigation(
  scope: string,
  mediaType?: OutputTypeValue,
  countsEnabled = true,
) {
  const countsKey = JSON.stringify([scope, mediaType ?? 'all'])
  // 文件夹列表是共用查询（换账号由 `QueryUserBoundary` 整份清空，不靠 `scope` 隔开）。
  const projectsResult = useQuery(projectsQuery, queryClient)
  const projects = projectsResult.data ?? NO_PROJECTS
  const [countsState, setCountsState] = useState(() => ({
    key: countsKey,
    data: countsCache.get(countsKey)?.data ?? null,
  }))

  const loadCounts = useCallback(
    (force: boolean) =>
      loadCached(
        countsCache,
        countsKey,
        async () => {
          const response = await fetchAssetSectionCounts(
            mediaType ? [mediaType] : [],
          )
          if (!response.success) throw new ApiClientError(response)
          return response.data
        },
        force,
      ),
    [countsKey, mediaType],
  )

  useEffect(() => {
    let active = true
    if (countsEnabled)
      void loadCounts(false)
        .then((data) => {
          if (active) setCountsState({ key: countsKey, data })
        })
        .catch(() => {})
    return () => {
      active = false
    }
  }, [countsKey, countsEnabled, loadCounts])

  const refreshCounts = useCallback(async () => {
    try {
      const data = await loadCounts(true)
      setCountsState({ key: countsKey, data })
    } catch {
      // Keep the last successful counts while the image grid remains usable.
    }
  }, [countsKey, loadCounts])

  return {
    projects,
    counts:
      countsState.key === countsKey
        ? countsState.data
        : (countsCache.get(countsKey)?.data ?? null),
    refreshCounts,
  }
}
