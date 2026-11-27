'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { QUERY_KEYS, QUERY_TIMING } from '@/constants/query'
import { lookupTagMetaBatchAPI } from '@/lib/api-client/tag-assist'
import { queryClient } from '@/lib/query-client'
import { toDanbooruUnderscoreTag } from '@/lib/tag-recognition'
import type { DanbooruTagMetaEntry } from '@/types/tag-assist'

const EMPTY_ITEMS: Readonly<Record<string, DanbooruTagMetaEntry>> = {}
const META_DEBOUNCE_MS = 350

/**
 * 批量读取一批标签的中日文释义、注释与词库热度，走全局 TanStack Query 缓存。
 * ⚠ 词库只是辅助展示：防抖后再查、失败静默回空，不阻塞打字与出图。
 */
export function useTagMetaLookup(
  rawTags: readonly string[],
  enabled: boolean,
): {
  items: Readonly<Record<string, DanbooruTagMetaEntry>>
  loading: boolean
} {
  const rawSignature = enabled ? rawTags.join('\u0000') : ''
  const normalizedKeys = useMemo(() => {
    if (!enabled || !rawSignature) return []
    const set = new Set<string>()
    for (const raw of rawSignature.split('\u0000')) {
      const key = toDanbooruUnderscoreTag(raw)
      if (key && key.length <= 160 && !key.includes('|')) {
        set.add(key)
        if (set.size >= 100) break
      }
    }
    return [...set].sort()
  }, [enabled, rawSignature])

  const signature = normalizedKeys.join('\u0000')
  const [debounced, setDebounced] = useState<{
    signature: string
    keys: string[]
  }>({ signature: '', keys: [] })

  useEffect(() => {
    if (!enabled || normalizedKeys.length === 0) return
    const timer = setTimeout(() => {
      setDebounced({ signature, keys: normalizedKeys })
    }, META_DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `signature` uniquely represents `normalizedKeys`
  }, [enabled, signature])

  const activeKeys =
    enabled && normalizedKeys.length > 0 && debounced.signature === signature
      ? debounced.keys
      : []

  const query = useQuery(
    {
      queryKey: QUERY_KEYS.tagMeta(activeKeys),
      queryFn: async ({ signal }) => {
        try {
          const response = await lookupTagMetaBatchAPI(activeKeys, signal)
          return response.items
        } catch {
          return EMPTY_ITEMS
        }
      },
      enabled: activeKeys.length > 0,
      staleTime: QUERY_TIMING.gcMs,
      gcTime: QUERY_TIMING.gcMs,
      placeholderData: (previous) => previous,
    },
    queryClient,
  )

  return {
    items: query.data ?? EMPTY_ITEMS,
    loading: query.isFetching,
  }
}
