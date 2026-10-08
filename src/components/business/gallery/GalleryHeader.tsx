'use client'

import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import { Heart, Search, X } from '@/components/icons'
import {
  getAvailableImageModels,
  getAvailableVideoModels,
} from '@/constants/models'
import { DURATION, EASE_STANDARD, SPRING } from '@/constants/motion'
import { AssetFacetBar } from '@/components/business/assets/AssetFacetBar'
import { BlurSwap } from '@/components/ui/blur-swap'
import type { GalleryFilters } from '@/hooks/use-gallery'
import { toastError } from '@/lib/toast'
import { cn } from '@/lib/utils'

/** 搜索框停手多久才发请求。 */
const SEARCH_DEBOUNCE_MS = 400
/** 收起后那条细线的高（px）。 */
const COLLAPSED_LINE_PX = 6
/** 滚过这么远之后，往下滚才收起顶栏（页顶附近一直展开）。 */
const COLLAPSE_AFTER_SCROLL_PX = 120
/** 单次滚动小于这个量不算换方向（触控板的抖动）。 */
const SCROLL_DIRECTION_SLOP_PX = 6
/** 顶栏只在 ≥768 吸顶（手机折成三行、不吸），收起也只在这一档做。 */
const STICKY_MEDIA_QUERY = '(min-width: 768px)'

interface GalleryHeaderProps {
  filters: GalleryFilters
  onFiltersChange: (filters: GalleryFilters) => void
  /** 查看器开着：顶栏一直展开（它的底边是查看器的顶）。 */
  pinnedOpen?: boolean
}

/**
 * 画廊顶栏（owner 2026-10-08 画廊换皮）：只留类型 / 模型 / 时间 / 排序四个分面（素材页
 * 的 `AssetFacetBar`，没有「状态」那一格）+ 搜索 + 「我赞过的」，吸在页顶。
 *
 * - 往下滚收成一条细线、往上滚或指针移上去（键盘进到里面）再展开。收放只动 `clip-path`
 *   （`SPRING.slot`），⛔ 不改它在文档里的高：改高会让底下的瀑布流整片跳。
 * - 搜索框聚焦时变宽（`ease-spring-slot`）；服务端只按提示词搜（公开提示词）。
 */
export const GalleryHeader = memo(function GalleryHeader({
  filters,
  onFiltersChange,
  pinnedOpen = false,
}: GalleryHeaderProps) {
  const t = useTranslations('GalleryPage')
  const tFilters = useTranslations('GalleryPage.filters')
  const { isSignedIn } = useAuth()
  const reducedMotion = useReducedMotion()
  const [searchInput, setSearchInput] = useState(filters.search)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const headerRef = useRef<HTMLElement>(null)
  const [isStuck, setIsStuck] = useState(false)
  const [collapsedByScroll, setCollapsedByScroll] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [headerHeight, setHeaderHeight] = useState(0)

  const expanded = pinnedOpen || hovered || !collapsedByScroll

  // 分面条上的「“词” ×」清掉搜索时，框里的字跟着清。
  const [syncedSearch, setSyncedSearch] = useState(filters.search)
  if (syncedSearch !== filters.search) {
    setSyncedSearch(filters.search)
    if (filters.search !== searchInput.trim()) setSearchInput(filters.search)
  }

  useEffect(() => {
    let lastY = window.scrollY
    const sticky =
      typeof window.matchMedia === 'function'
        ? window.matchMedia(STICKY_MEDIA_QUERY)
        : null
    const onScroll = () => {
      const y = window.scrollY
      setIsStuck(y > 8)
      const delta = y - lastY
      if (Math.abs(delta) < SCROLL_DIRECTION_SLOP_PX) return
      lastY = y
      if (delta < 0 || y < COLLAPSE_AFTER_SCROLL_PX) {
        setCollapsedByScroll(false)
        return
      }
      const header = headerRef.current
      // 正在用的时候不收：焦点在里面，或者某个分面弹层开着。
      if (
        !sticky?.matches ||
        !header ||
        header.contains(document.activeElement) ||
        header.querySelector('[aria-expanded="true"]')
      ) {
        return
      }
      setCollapsedByScroll(true)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // 收起时 clip-path 要知道顶栏有多高（筛选 chip 行长出来时会变）。
  useEffect(() => {
    const header = headerRef.current
    if (!header || typeof ResizeObserver === 'undefined') return
    const measure = () => setHeaderHeight(header.offsetHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(header)
    return () => observer.disconnect()
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

  const clipBottom = Math.max(headerHeight - COLLAPSED_LINE_PX, 0)
  const contentTransition = {
    duration: reducedMotion ? DURATION.fast : DURATION.base,
    ease: EASE_STANDARD,
  }

  return (
    // 吸顶的是外面这层：展开时方角页底色盖住头顶那 12（滚过去的图不从缝里露出来）；收起后
    // 变透明，只剩一条线，图从它周围透出来。手机上顶栏折成三行，不吸也不收；平板吸在紧凑
    // 外壳那条 44 的固定栏下面。
    <div
      data-collapsed={!expanded || undefined}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') setHovered(true)
      }}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => setCollapsedByScroll(false)}
      className={cn(
        'relative z-30 -mt-3 pt-3 transition-colors duration-fast ease-linear md:sticky md:top-11 lg:top-0',
        expanded
          ? 'bg-surface-workbench'
          : 'pointer-events-none bg-transparent',
      )}
    >
      {/* 收起时的悬停区：线上下各让一点，⛔ 只靠 6px 那条线去对准。 */}
      {!expanded ? (
        <div
          aria-hidden
          className="pointer-events-auto absolute inset-x-0 top-0 h-6"
        />
      ) : null}
      <motion.header
        ref={headerRef}
        initial={false}
        animate={{
          clipPath: expanded
            ? 'inset(0px 0px 0px 0px round 16px)'
            : `inset(0px 0px ${clipBottom}px 0px round 3px)`,
        }}
        transition={reducedMotion ? { duration: 0 } : SPRING.slot}
        className={cn(
          'pointer-events-auto relative w-full rounded-2xl border bg-background transition-[border-color,box-shadow] duration-base ease-standard',
          isStuck && expanded
            ? 'border-border shadow-md'
            : 'border-border/70 shadow-sm',
        )}
      >
        {/* 收起后那条线：中性灰，⛔ 别的颜色。 */}
        <motion.span
          aria-hidden
          initial={false}
          animate={{ opacity: expanded ? 0 : 1 }}
          transition={contentTransition}
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-1.5 bg-border"
        />
        <motion.div
          initial={false}
          animate={
            expanded || reducedMotion
              ? { opacity: expanded ? 1 : 0, filter: 'blur(0px)' }
              : { opacity: 0, filter: 'blur(6px)' }
          }
          transition={contentTransition}
          className="flex min-h-14 w-full flex-wrap items-center gap-2 px-4 py-2"
        >
          <h1 className="sr-only">{t('feedEyebrow')}</h1>

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
            <label className="flex h-8 w-44 items-center gap-2 rounded-lg bg-muted/60 px-2.5 text-xs text-foreground transition-[width,background-color] duration-spring-slot ease-spring-slot focus-within:bg-muted motion-reduce:transition-none sm:w-56 sm:focus-within:w-80">
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
                'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                filters.liked
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <BlurSwap swapKey={filters.liked ? 'on' : 'off'}>
                <Heart
                  weight={filters.liked ? 'fill' : 'bold'}
                  className="size-3.5"
                  aria-hidden
                />
              </BlurSwap>
              {tFilters('tabs.favorites')}
            </button>
          </div>
        </motion.div>
      </motion.header>
    </div>
  )
})
