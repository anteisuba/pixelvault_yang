/**
 * Module-level cache of first-page gallery responses keyed by filter
 * combination. Originally lived inside `useGallery` as a useRef Map; was
 * lifted here so callers (e.g. KreaAssetBrowser hover prefetch) can
 * warm the cache before the hook ever sees a `setFilters` call —
 * giving Krea-style 0ms switches when the user finally clicks.
 *
 * FIFO with a small cap. Most sessions stay well under 8 distinct
 * filter combinations (All / Favorites / Image / Video / Audio /
 * Unassigned + a few folders), and dropping the oldest entry costs at
 * most one extra fetch when the user revisits it.
 */

import type {
  GallerySortOption,
  GalleryTimeRange,
  GenerationRecord,
  OutputTypeValue,
} from '@/types'

export interface GalleryFilterShape {
  search: string
  models: string[]
  sort: GallerySortOption
  types: OutputTypeValue[]
  timeRange: GalleryTimeRange
  liked: boolean
  published: boolean
  projectId: string
  provider?: string
}

export interface GalleryCacheEntry {
  generations: GenerationRecord[]
  total: number
  hasMore: boolean
  nextCursor: string | null
}

const CACHE_MAX = 8
const cache = new Map<string, GalleryCacheEntry>()

export function makeGalleryCacheKey(
  filters: GalleryFilterShape,
  mine: boolean,
  limit: number,
): string {
  // Explicit field order so JSON.stringify is stable across callers.
  // 多选分面先排序再入键 —— 勾选顺序不同但集合相同的两次筛选，必须命中
  // 同一个缓存条目，否则「图片+视频」和「视频+图片」会各占一格。
  return JSON.stringify({
    s: filters.search,
    m: [...filters.models].sort(),
    sort: filters.sort,
    t: [...filters.types].sort(),
    r: filters.timeRange,
    l: filters.liked,
    published: filters.published,
    p: filters.projectId,
    provider: filters.provider,
    mine,
    limit,
  })
}

export function readGalleryCache(key: string): GalleryCacheEntry | undefined {
  return cache.get(key)
}

export function writeGalleryCache(key: string, entry: GalleryCacheEntry): void {
  // Map preserves insertion order, so delete + set promotes the entry
  // to "most recent" — a simple LRU-ish eviction.
  cache.delete(key)
  cache.set(key, entry)
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

export function clearGalleryCache(): void {
  cache.clear()
}
