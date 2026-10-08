'use client'

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react'
import { useTranslations } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import { buildGalleryQueryString } from '@/lib/gallery-query'

import { GalleryHeader } from '@/components/business/gallery/GalleryHeader'
import { GalleryViewer } from '@/components/business/gallery/GalleryViewer'
import { AssetPaginationError } from '@/components/business/assets/AssetStateBlocks'
import { GalleryGrid } from '@/components/business/GalleryGrid'
import { Spinner } from '@/components/ui/spinner'
import { useGallery, type GalleryFilters } from '@/hooks/use-gallery'
import { useIsMobile } from '@/hooks/use-mobile'
import { toggleLikeAPI } from '@/lib/api-client'
import type { GenerationRecord } from '@/types'

interface GalleryFeedProps {
  initialGenerations: GenerationRecord[]
  initialPage: number
  initialHasMore: boolean
  initialNextCursor: string | null
  total: number
  initialFilters: GalleryFilters
}

export function GalleryFeed({
  initialGenerations,
  initialPage,
  initialHasMore,
  initialNextCursor,
  total,
  initialFilters,
}: GalleryFeedProps) {
  const t = useTranslations('GalleryPage')
  const {
    generations,
    isLoading,
    hasMore,
    error,
    appendError,
    retryLoadMore,
    filters,
    setFilters,
    sentinelRef,
    updateGeneration,
  } = useGallery({
    initialGenerations,
    initialPage,
    initialHasMore,
    initialNextCursor,
    initialTotal: total,
    initialFilters,
  })

  // 桌面点开是就地查看器；平板与手机沿用卡片自己的全屏详情（owner 09-29）。
  const isCompact = useIsMobile()
  const [viewerId, setViewerId] = useState<string | null>(null)
  const viewing =
    !isCompact && viewerId
      ? (generations.find((generation) => generation.id === viewerId) ?? null)
      : null
  const images = useMemo(
    () => generations.filter((generation) => generation.outputType === 'IMAGE'),
    [generations],
  )
  const openViewer = useCallback(
    (generation: GenerationRecord) => setViewerId(generation.id),
    [],
  )
  const closeViewer = useCallback(() => setViewerId(null), [])
  const rootRef = useRef<HTMLDivElement>(null)
  const viewerBounds = useViewerBounds(Boolean(viewing), rootRef)

  const handleFiltersChange = useCallback(
    (nextFilters: GalleryFilters) => {
      const query = buildGalleryQueryString(nextFilters)
      const nextUrl = query
        ? `${window.location.pathname}?${query}`
        : window.location.pathname

      window.history.replaceState(window.history.state, '', nextUrl)
      setViewerId(null)
      setFilters(nextFilters)
    },
    [setFilters],
  )

  /**
   * ♥ 由画廊统一记：卡片与查看器看同一个数。先改（数字跳一下），请求没落库就
   * 退回原样；同一张在飞时不接第二下。
   */
  const likePendingRef = useRef(new Set<string>())
  const toggleLike = useCallback(
    async (generation: GenerationRecord) => {
      const id = generation.id
      if (likePendingRef.current.has(id)) return
      likePendingRef.current.add(id)
      const previous = {
        isLiked: Boolean(generation.isLiked),
        likeCount: generation.likeCount ?? 0,
      }
      updateGeneration(id, {
        isLiked: !previous.isLiked,
        likeCount: previous.isLiked
          ? Math.max(previous.likeCount - 1, 0)
          : previous.likeCount + 1,
      })
      try {
        const response = await toggleLikeAPI(id)
        if (response.success && response.data) {
          updateGeneration(id, {
            isLiked: response.data.liked,
            likeCount: response.data.likeCount,
          })
        } else {
          updateGeneration(id, previous)
        }
      } catch {
        updateGeneration(id, previous)
      } finally {
        likePendingRef.current.delete(id)
      }
    },
    [updateGeneration],
  )
  const handleToggleLike = useCallback(
    (generation: GenerationRecord) => void toggleLike(generation),
    [toggleLike],
  )

  return (
    <>
      {/* 顶栏与图之间 12（owner 2026-10-08）。 */}
      <div ref={rootRef} className="flex flex-col gap-3">
        <GalleryHeader
          filters={filters}
          onFiltersChange={handleFiltersChange}
          pinnedOpen={Boolean(viewing)}
        />

        <GalleryGrid
          generations={generations}
          emptyTitle={t('emptyTitle')}
          emptyDescription={t('emptyDescription')}
          emptyActionHref={ROUTES.STUDIO}
          emptyActionLabel={t('emptyAction')}
          feedLabel={t('feedLabel')}
          itemFallbackLabel={t('itemFallbackLabel')}
          onOpen={isCompact ? undefined : openViewer}
          onToggleLike={handleToggleLike}
        />

        {error ? (
          <div className="rounded-3xl border border-status-risk/30 bg-status-risk-surface px-4 py-3 text-sm text-status-risk">
            {error}
          </div>
        ) : null}

        {/* 无限滚动：滚到底自动接下一页（哨兵在 `useGallery` 里）；翻页失败只挡这一段，
            点「重试」再接着加载，⛔ 自动重试打死接口。 */}
        {appendError ? (
          <AssetPaginationError message={appendError} onRetry={retryLoadMore} />
        ) : null}
        {hasMore && !appendError ? (
          <div ref={sentinelRef} aria-hidden className="h-px w-full" />
        ) : null}
        {isLoading && generations.length > 0 ? (
          <div
            role="status"
            className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground"
          >
            <Spinner size="md" />
            <span className="sr-only">{t('loadingMore')}</span>
          </div>
        ) : null}
        {!hasMore && generations.length > 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            {t('endOfArchive')}
          </p>
        ) : null}
      </div>

      {/* 放在间距容器外：`gap` 会给它让出一道缝，把 bottom: 0 顶起来。 */}
      {viewing && viewerBounds ? (
        <div style={viewerBounds} className="fixed z-20">
          <GalleryViewer
            generation={viewing}
            images={images}
            onNavigate={openViewer}
            onClose={closeViewer}
            onToggleLike={handleToggleLike}
          />
        </div>
      ) : null}
    </>
  )
}

/**
 * 查看器盖住作品区：从顶栏底边起（本体再让 12）、左右贴着画廊这一列、到窗口底。开着时页面
 * 不跟着滚（留着滚动条那一道，底下的瀑布流不挪），关上原样放开、滚动位置不变。
 */
function useViewerBounds(
  open: boolean,
  rootRef: RefObject<HTMLDivElement | null>,
): CSSProperties | null {
  const [bounds, setBounds] = useState<CSSProperties | null>(null)

  useLayoutEffect(() => {
    if (!open) return
    const html = document.documentElement
    const previous = {
      overflow: html.style.overflow,
      scrollbarGutter: html.style.scrollbarGutter,
    }
    html.style.scrollbarGutter = 'stable'
    html.style.overflow = 'hidden'

    const measure = () => {
      const root = rootRef.current
      if (!root) return
      const box = root.getBoundingClientRect()
      const header = root.querySelector('header')?.getBoundingClientRect()
      setBounds({
        // 顶栏万一不在屏幕里（滚走了），从屏幕顶起，⛔ 整块被推到屏幕外。
        top: Math.max(header?.bottom ?? box.top, 0),
        left: box.left,
        right: html.clientWidth - box.right,
        bottom: 0,
      })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('resize', measure)
      html.style.overflow = previous.overflow
      html.style.scrollbarGutter = previous.scrollbarGutter
      setBounds(null)
    }
  }, [open, rootRef])

  return bounds
}
