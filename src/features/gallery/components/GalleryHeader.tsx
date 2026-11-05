'use client'

import { memo, useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useTranslations } from 'next-intl'

import type { OutputTypeValue } from '@/types'
import { FavoriteBookmark } from '@/components/ui/favorite-bookmark'
import {
  LIBRARY_PILL_CLASS,
  LibraryPillSelect,
  LibrarySearch,
  LibraryToolbar,
} from '@/components/ui/library-kit'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'
import type { GalleryFilters } from '@/hooks/use-gallery'
import { toastError } from '@/lib/toast'
import { cn } from '@/lib/utils'

/** 搜索框停手多久才发请求。 */
const SEARCH_DEBOUNCE_MS = 400

/** 切换条的档：「全部 · 图片 · 视频 · 音频 · 3D · 提示词」。 */
const GALLERY_SEGMENTS = [
  'all',
  'image',
  'video',
  'audio',
  'model_3d',
  'prompts',
] as const
type GallerySegment = (typeof GALLERY_SEGMENTS)[number]

function segmentOf(filters: GalleryFilters): GallerySegment {
  if (filters.view === 'prompts') return 'prompts'
  return filters.types.length === 1 ? filters.types[0] : 'all'
}

interface GalleryHeaderProps {
  filters: GalleryFilters
  onFiltersChange: (filters: GalleryFilters) => void
}

/**
 * 画廊顶栏（ui-spec §9「库 `LibraryPage`」，owner 2026-11-05 照规范只留切换条）：库同一副骨架 ——
 * 顶上搜索 ……… 「收藏」（书签）· 排序，下面一条切换条「全部 · 图片 · 视频 · 音频 · 3D · 提示词」。
 * ⛔ 模型 / 时间筛选（11-05 删）；⛔ 滚动收成细线（外壳里滚的是白板不是窗口）。吸在页顶，底色同白板。
 */
export const GalleryHeader = memo(function GalleryHeader({
  filters,
  onFiltersChange,
}: GalleryHeaderProps) {
  const t = useTranslations('GalleryPage')
  const tFilters = useTranslations('GalleryPage.filters')
  const { isSignedIn } = useAuth()
  const [searchInput, setSearchInput] = useState(filters.search)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 外面把搜索清掉（换页、URL）时，框里的字跟着清。
  const [syncedSearch, setSyncedSearch] = useState(filters.search)
  if (syncedSearch !== filters.search) {
    setSyncedSearch(filters.search)
    if (filters.search !== searchInput.trim()) setSearchInput(filters.search)
  }

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    },
    [],
  )

  const changeSearch = (value: string) => {
    setSearchInput(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onFiltersChange({ ...filters, search: value.trim() })
    }, SEARCH_DEBOUNCE_MS)
  }

  const changeSegment = (segment: GallerySegment) => {
    // 旧链接带进来的模型 / 时间筛选这里没有地方清：换档时一并放掉。
    const base = { ...filters, models: [], timeRange: 'all' as const }
    if (segment === 'prompts') {
      onFiltersChange({ ...base, view: 'prompts', types: [] })
      return
    }
    onFiltersChange({
      ...base,
      view: 'images',
      types: segment === 'all' ? [] : [segment satisfies OutputTypeValue],
    })
  }

  const toggleLiked = () => {
    if (!isSignedIn) {
      toastError(tFilters('signInToFavorite'))
      return
    }
    onFiltersChange({ ...filters, liked: !filters.liked })
  }

  const segmentLabel = (segment: GallerySegment) =>
    segment === 'all'
      ? tFilters('tabs.all')
      : segment === 'prompts'
        ? t('viewPrompts')
        : tFilters(`type.${segment}`)

  return (
    // 吸顶：白底盖住滚过去的图（外壳里吸在白板顶，单独打开吸在窗口顶）。
    <div className="sticky top-0 z-30 -mt-3 bg-background pt-3 pb-1">
      <h1 className="sr-only">{t('feedEyebrow')}</h1>
      <LibraryToolbar
        search={
          <LibrarySearch
            value={searchInput}
            onChange={changeSearch}
            placeholder={tFilters('searchPlaceholder')}
            label={tFilters('searchLabel')}
          />
        }
        end={
          <>
            <button
              type="button"
              onClick={toggleLiked}
              aria-pressed={filters.liked}
              className={cn(
                LIBRARY_PILL_CLASS,
                filters.liked && 'bg-fill-strong',
              )}
            >
              <FavoriteBookmark saved={filters.liked} />
              {tFilters('tabs.favorites')}
            </button>
            <LibraryPillSelect
              label={tFilters('sortLabel')}
              value={filters.sort}
              options={[
                { value: 'newest', label: tFilters('sort.newest') },
                { value: 'oldest', label: tFilters('sort.oldest') },
              ]}
              onChange={(sort) => onFiltersChange({ ...filters, sort })}
            />
          </>
        }
      />
      {/* coarse 下上下让出 10px 再负边距抵回：横滚行会把页签的 44 命中区裁回 31（u-audit-mobile）。 */}
      <div className="mt-3 flex min-w-0 overflow-x-auto coarse:mt-0.5 coarse:-mb-2.5 coarse:py-2.5">
        <LiquidSegmented
          ariaLabel={t('viewLabel')}
          semantics="tabs"
          value={segmentOf(filters)}
          items={GALLERY_SEGMENTS.map((segment) => ({
            value: segment,
            label: segmentLabel(segment),
          }))}
          onChange={changeSegment}
        />
      </div>
    </div>
  )
})
