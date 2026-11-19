'use client'

import { memo, useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useTranslations } from 'next-intl'

import type { OutputTypeValue } from '@/types'
import {
  LibraryPillSelect,
  LibraryScopeSelect,
  LibraryToolbar,
} from '@/components/ui/library-kit'
import { LiquidSegmented } from '@/components/ui/liquid-segmented'
import type { GalleryFilters } from '@/hooks/use-gallery'
import { useWindowScrollAway } from '@/hooks/use-window-scroll-away'
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
 * 画廊顶栏（ui-spec §9「库 `LibraryPage`」）：库同一副骨架 —— 一行：分组药丸「全部作品 · 收藏」
 *（收藏 = `filters.liked`）· 切换条「全部 · 图片 · 视频 · 音频 · 3D · 提示词」……… 搜索 · 排序。
 * ⛔ 分组药丸写数：画廊没有按分组的真实总数（`total` 跟着切换条 / 搜索变），写了就是假数。
 * ⛔ 模型 / 时间筛选（11-05 删）；⛔ 滚动收成细线（外壳里滚的是白板不是窗口）。吸在页顶，底色同白板。
 */
export const GalleryHeader = memo(function GalleryHeader({
  filters,
  onFiltersChange,
}: GalleryHeaderProps) {
  const t = useTranslations('GalleryPage')
  const tFilters = useTranslations('GalleryPage.filters')
  const { isSignedIn } = useAuth()
  const scrolledAway = useWindowScrollAway()
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

  const changeScope = (scope: 'all' | 'favorites') => {
    const liked = scope === 'favorites'
    if (liked === filters.liked) return
    if (liked && !isSignedIn) {
      toastError(tFilters('signInToFavorite'))
      return
    }
    onFiltersChange({ ...filters, liked })
  }

  const segmentLabel = (segment: GallerySegment) =>
    segment === 'all'
      ? tFilters('tabs.all')
      : segment === 'prompts'
        ? t('viewPrompts')
        : tFilters(`type.${segment}`)

  return (
    // 吸顶：白底盖住滚过去的图（外壳里吸在白板顶，单独打开吸在窗口顶）。
    // 手机上和底栏一起「往下滑收起、往上滑回来」，图多露一截（窗口滚动才有，外壳里不动）。
    <div
      className={cn(
        'sticky top-0 z-30 -mt-3 bg-background pt-3 pb-1 transition-transform duration-base ease-standard motion-reduce:transition-none',
        scrolledAway && 'max-md:-translate-y-full',
      )}
    >
      <h1 className="sr-only">{t('feedEyebrow')}</h1>
      <LibraryToolbar
        scope={
          <LibraryScopeSelect
            label={tFilters('tabs.scopeLabel')}
            value={filters.liked ? 'favorites' : 'all'}
            items={[
              { value: 'all', label: tFilters('tabs.allWorks') },
              { value: 'favorites', label: tFilters('tabs.favorites') },
            ]}
            onChange={changeScope}
          />
        }
        segments={
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
        }
        search={{
          value: searchInput,
          onChange: changeSearch,
          placeholder: tFilters('searchPlaceholder'),
          label: tFilters('searchLabel'),
        }}
        end={
          <LibraryPillSelect
            label={tFilters('sortLabel')}
            value={filters.sort}
            options={[
              { value: 'newest', label: tFilters('sort.newest') },
              { value: 'oldest', label: tFilters('sort.oldest') },
            ]}
            onChange={(sort) => onFiltersChange({ ...filters, sort })}
          />
        }
      />
    </div>
  )
})
