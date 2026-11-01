'use client'

import { useCallback, useEffect, useState } from 'react'

import { ASSET_PICKER_CACHE_TTL_MS } from '@/constants/assets-grid'
import { fetchAssetSectionCounts } from '@/lib/api-client/gallery'
import { listProjectsAPI } from '@/lib/api-client/projects'
import type {
  AssetSectionCounts,
  OutputTypeValue,
  ProjectRecord,
} from '@/types'

interface CacheEntry<T> {
  data?: T
  expiresAt: number
  pending?: Promise<T>
}

const projectsCache = new Map<string, CacheEntry<ProjectRecord[]>>()
const countsCache = new Map<string, CacheEntry<AssetSectionCounts>>()

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
  const [projectsState, setProjectsState] = useState(() => ({
    key: scope,
    data: projectsCache.get(scope)?.data ?? [],
  }))
  const [countsState, setCountsState] = useState(() => ({
    key: countsKey,
    data: countsCache.get(countsKey)?.data ?? null,
  }))

  const loadProjects = useCallback(
    () =>
      loadCached(
        projectsCache,
        scope,
        async () => {
          const response = await listProjectsAPI()
          if (!response.success || !response.data)
            throw new Error(response.error ?? 'Failed to load projects')
          return response.data
        },
        false,
      ),
    [scope],
  )

  const loadCounts = useCallback(
    (force: boolean) =>
      loadCached(
        countsCache,
        countsKey,
        async () => {
          const response = await fetchAssetSectionCounts(
            mediaType ? [mediaType] : [],
          )
          if (!response.success)
            throw new Error(response.error ?? 'Failed to load counts')
          return response.data
        },
        force,
      ),
    [countsKey, mediaType],
  )

  useEffect(() => {
    let active = true
    void loadProjects()
      .then((data) => {
        if (active) setProjectsState({ key: scope, data })
      })
      .catch(() => {})
    if (countsEnabled)
      void loadCounts(false)
        .then((data) => {
          if (active) setCountsState({ key: countsKey, data })
        })
        .catch(() => {})
    return () => {
      active = false
    }
  }, [scope, countsKey, countsEnabled, loadProjects, loadCounts])

  const refreshCounts = useCallback(async () => {
    try {
      const data = await loadCounts(true)
      setCountsState({ key: countsKey, data })
    } catch {
      // Keep the last successful counts while the image grid remains usable.
    }
  }, [countsKey, loadCounts])

  return {
    projects:
      projectsState.key === scope
        ? projectsState.data
        : (projectsCache.get(scope)?.data ?? []),
    counts:
      countsState.key === countsKey
        ? countsState.data
        : (countsCache.get(countsKey)?.data ?? null),
    refreshCounts,
  }
}
