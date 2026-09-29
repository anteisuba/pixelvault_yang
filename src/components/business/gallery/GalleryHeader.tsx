'use client'

import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useTranslations } from 'next-intl'

import { Heart, Search, X } from '@/components/icons'
import {
  getAvailableImageModels,
  getAvailableVideoModels,
} from '@/constants/models'
import { AssetFacetBar } from '@/components/business/assets/AssetFacetBar'
import type { GalleryFilters } from '@/hooks/use-gallery'
import { toastError } from '@/lib/toast'
import { cn } from '@/lib/utils'

/** 搜索框停手多久才发请求。 */
const SEARCH_DEBOUNCE_MS = 400

interface GalleryHeaderProps {
  filters: GalleryFilters
  onFiltersChange: (filters: GalleryFilters) => void
  /** 当前筛选下的公开作品总数（顶栏标题旁的数字）。 */
  total: number
}

/**
 * 画廊顶栏（domains/gallery.md「卡片、顶栏与详情」· 画布「画廊 · 卡片与详情」A）：
 * 与素材页同一颗 —— 「画廊 N」+ 分面下拉（素材页的 `AssetFacetBar`，没有「状态」
 * 那一格）+ 搜索 + 「我赞过的」，吸在页顶。
 */
export const GalleryHeader = memo(function GalleryHeader({
  filters,
  onFiltersChange,
  total,
}: GalleryHeaderProps) {
  const t = useTranslations('GalleryPage')
  const tFilters = useTranslations('GalleryPage.filters')
  const { isSignedIn } = useAuth()
  const [searchInput, setSearchInput] = useState(filters.search)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isStuck, setIsStuck] = useState(false)

  // 分面条上的「“词” ×」清掉搜索时，框里的字跟着清。
  const [syncedSearch, setSyncedSearch] = useState(filters.search)
  if (syncedSearch !== filters.search) {
    setSyncedSearch(filters.search)
    if (filters.search !== searchInput.trim()) setSearchInput(filters.search)
  }

  useEffect(() => {
    const onScroll = () => setIsStuck(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    },
    [],
  )

  // 画廊没有公开作品的模型聚合：选项表取模型目录，按类型收窄，计数留空。
  const modelCounts = useMemo(() => {
    const onlyImage =
      filters.types.length > 0 &&
      filters.types.every((type) => type === 'image')
    const onlyVideo =
      filters.types.length > 0 &&
      filters.types.every((type) => type === 'video')
    const models = onlyImage
      ? getAvailableImageModels()
      : onlyVideo
        ? getAvailableVideoModels()
        : [...getAvailableImageModels(), ...getAvailableVideoModels()]
    return Object.fromEntries(models.map((model) => [model.id, undefined]))
  }, [filters.types])

  const changeSearch = (value: string) => {
    setSearchInput(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onFiltersChange({ ...filters, search: value.trim() })
    }, SEARCH_DEBOUNCE_MS)
  }

  const clearSearch = () => {
    setSearchInput('')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    onFiltersChange({ ...filters, search: '' })
  }

  const toggleLiked = () => {
    if (!isSignedIn) {
      toastError(tFilters('signInToFavorite'))
      return
    }
    onFiltersChange({ ...filters, liked: !filters.liked })
  }

  return (
    // 吸顶的是外面这层方角页底色：头顶那 12 与圆角外面都盖住，滚过去的图不从缝里露出来。
    // 手机上顶栏折成三行，不吸；平板吸在紧凑外壳那条 44 的固定栏下面。
    <div className="z-30 -mt-3 bg-surface-workbench pt-3 md:sticky md:top-11 lg:top-0">
      <header
        data-stuck={isStuck || undefined}
        className={cn(
          'flex min-h-14 w-full flex-wrap items-center gap-2 rounded-2xl border bg-background px-4 py-2 transition-[border-color,box-shadow] duration-base ease-standard',
          isStuck ? 'border-border shadow-md' : 'border-border/70 shadow-sm',
        )}
      >
        <div className="flex min-w-0 items-baseline gap-1.5">
          <h1 className="truncate text-base font-semibold text-foreground">
            {t('feedEyebrow')}
          </h1>
          <span className="text-xs tabular-nums text-muted-foreground">
            {total}
          </span>
        </div>

        <AssetFacetBar
          filters={filters}
          onFiltersChange={onFiltersChange}
          typeCounts={{}}
          statusCounts={{}}
          modelCounts={modelCounts}
          statusFacet={false}
          className="order-3 w-full min-w-0 sm:order-none sm:w-auto sm:flex-1"
        />

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <label className="flex h-8 w-44 items-center gap-2 rounded-lg border border-border px-2.5 text-xs text-foreground transition-colors focus-within:border-foreground/35 sm:w-60">
            <Search
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => changeSearch(event.target.value)}
              placeholder={tFilters('searchPlaceholder')}
              aria-label={tFilters('searchLabel')}
              className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-xs"
            />
            {searchInput ? (
              <button
                type="button"
                onClick={clearSearch}
                aria-label={tFilters('clearSearch')}
                className="grid size-5 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-3" aria-hidden />
              </button>
            ) : null}
          </label>
          <button
            type="button"
            onClick={toggleLiked}
            aria-pressed={filters.liked}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors duration-fast',
              filters.liked
                ? 'border-transparent bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            <Heart
              weight={filters.liked ? 'fill' : 'bold'}
              className="size-3.5"
              aria-hidden
            />
            {tFilters('tabs.favorites')}
          </button>
        </div>
      </header>
    </div>
  )
})
