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
import { GallerySkeletonGrid } from '@/components/business/gallery/GallerySkeleton'
import { FeedTail } from '@/components/business/FeedTail'
import { GalleryGrid } from '@/components/business/GalleryGrid'
import { PageLoadError } from '@/components/business/PageLoadError'
import { useGallery, type GalleryFilters } from '@/hooks/use-gallery'
import { useIsMobile, useIsTablet } from '@/hooks/use-mobile'
import { useSlowLoadingNotice } from '@/hooks/use-slow-loading-notice'
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
    retry,
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

  // 等太久（6 秒）底部黑条「网有点慢，还在加载」，数据到了自己收掉（加载中 2026-10-08）。
  useSlowLoadingNotice(isLoading)

  // 桌面点开是就地查看器；平板与手机沿用卡片自己的全屏详情（owner 09-29）。
  /**
   * 手机与平板点开走 `ImageDetailModal`，就地查看器只给 ≥1024（owner 09-29：平板 820 宽时
   * 右栏 340 把舞台挤到约 290 宽）。桌面壳下移到 768 后平板也是桌面壳，这一条单独留着。
   */
  const isPhone = useIsMobile()
  const isTablet = useIsTablet()
  const isCompact = isPhone || isTablet
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

        {/* 换筛选、缓存里没有：静止的灰块（⛔ 先闪一下「空」）；整页没拿到：统一出错模板。 */}
        {generations.length === 0 && error ? (
          <PageLoadError title={error} onRetry={retry} retrying={isLoading} />
        ) : generations.length === 0 && isLoading ? (
          <GallerySkeletonGrid rows={3} />
        ) : (
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
        )}

        {/* 无限滚动（哨兵在 `useGallery` 里，离底部一屏就开始拿）：在拿 = 接一排灰块；
            这一批没拿到 = 灰块底下一句「这批没拿到 · 重试」，⛔ 自动重试打死接口；
            拿完 = 最底「没有更多了」。 */}
        {generations.length > 0 ? (
          <FeedTail
            loading={isLoading}
            error={appendError}
            ended={!hasMore}
            onRetry={retryLoadMore}
            placeholder={<GallerySkeletonGrid />}
          />
        ) : null}
        {hasMore && !appendError ? (
          <div ref={sentinelRef} aria-hidden className="h-px w-full" />
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
