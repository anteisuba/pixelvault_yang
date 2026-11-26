'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useTranslations } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import {
  buildGalleryQueryString,
  clearGalleryNarrowing,
  galleryEmptyKind,
} from '@/features/gallery/lib/gallery-query'
import { Link } from '@/i18n/navigation'
import { Search } from '@/components/icons'

import { GalleryHeader } from '@/features/gallery/components/GalleryHeader'
import { GalleryPromptList } from '@/features/gallery/components/GalleryPromptList'
import { GalleryViewer } from '@/features/gallery/components/GalleryViewer'
import { GallerySkeletonGrid } from '@/features/gallery/components/GallerySkeleton'
import { FeedTail } from '@/components/business/FeedTail'
import { GalleryGrid } from '@/features/gallery/components/GalleryGrid'
import { PageLoadError } from '@/components/business/PageLoadError'
import { Button } from '@/components/ui/button'
import { useGallery, type GalleryFilters } from '@/hooks/use-gallery'
import {
  useReportLibraryItem,
  useReportLibraryScreen,
} from '@/hooks/use-library-view'
import { useIsMobile, useIsTablet } from '@/hooks/use-mobile'
import { useSamePromptWorks } from '@/hooks/use-same-prompt-works'
import { useSlowLoadingNotice } from '@/hooks/use-slow-loading-notice'
import { toggleLikeAPI } from '@/lib/api-client'
import type { GenerationRecord } from '@/types'
import { ASSISTANT_LIBRARY_SCREEN_LIMIT } from '@/types/assistant-operator'

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

  /**
   * 桌面点开是就地查看器；手机是同一个查看器的整屏形态（左右滑、往下拉关、作者与配方在
   * 底部上滑，owner 2026-10-14）。平板仍走卡片自己的 `ImageDetailModal`（owner 09-29：
   * 平板 820 宽时右栏 340 把舞台挤到约 290 宽）。
   */
  const isPhone = useIsMobile()
  const isTablet = useIsTablet()
  const [viewerId, setViewerId] = useState<string | null>(null)
  /**
   * 从提示词卡点开时记下那一张：查看器只翻这段提示词出的公开作品（不分作者），
   * ⛔ 翻到列表里别的提示词的图（owner 2026-10-23）。
   */
  const [promptAnchorId, setPromptAnchorId] = useState<string | null>(null)
  const { works: promptWorks, updateWork: updatePromptWork } =
    useSamePromptWorks(promptAnchorId)
  const viewing =
    !isTablet && viewerId
      ? (promptWorks.find((work) => work.id === viewerId) ??
        generations.find((generation) => generation.id === viewerId) ??
        null)
      : null
  // 助手认得出「这张」：画廊开着时把查看器里那一张报给它（`use-library-view`）。
  useReportLibraryItem(viewing ? { kind: 'gallery', name: viewing.id } : null)
  /**
   * 屏上那一页（11-17，同素材库）：搜了什么、哪些筛选、一共几张、已加载的前几张。
   * ⭐ 屏上真在视口里的那几格与它们的一行摘要由扫屏补（`generationScreenAbout` 挂在格子上）。
   */
  useReportLibraryScreen({
    kind: 'gallery',
    scope: [
      'public pictures by everyone',
      filters.types.length ? `type ${filters.types.join('/')}` : '',
      filters.models.length ? `models ${filters.models.join(', ')}` : '',
      filters.timeRange === 'all' ? '' : `time ${filters.timeRange}`,
      filters.liked ? 'liked only' : '',
      `sorted ${filters.sort}`,
    ]
      .filter(Boolean)
      .join(' · '),
    ...(filters.search ? { search: filters.search } : {}),
    total,
    visible: generations
      .slice(0, ASSISTANT_LIBRARY_SCREEN_LIMIT)
      .map((generation) => generation.id),
  })
  const images = useMemo(
    () =>
      (promptAnchorId ? promptWorks : generations).filter(
        (generation) => generation.outputType === 'IMAGE',
      ),
    [promptAnchorId, promptWorks, generations],
  )
  const openViewer = useCallback(
    (generation: GenerationRecord) => setViewerId(generation.id),
    [],
  )
  const openPromptViewer = useCallback((generation: GenerationRecord) => {
    setPromptAnchorId(generation.id)
    setViewerId(generation.id)
  }, [])
  const closeViewer = useCallback(() => {
    setViewerId(null)
    setPromptAnchorId(null)
  }, [])

  const handleFiltersChange = useCallback(
    (nextFilters: GalleryFilters) => {
      const query = buildGalleryQueryString(nextFilters)
      const nextUrl = query
        ? `${window.location.pathname}?${query}`
        : window.location.pathname

      window.history.replaceState(window.history.state, '', nextUrl)
      closeViewer()
      setFilters(nextFilters)
    },
    [closeViewer, setFilters],
  )

  /**
   * 空态分三种（`galleryEmptyKind`）：带搜索词 / 收窄了筛选没结果，说「没找到」并给一颗
   * 「清除」；什么都没收窄才是库本身空，照旧「还很安静」+「打开工作台」。
   */
  const emptyKind = galleryEmptyKind(filters)
  const clearNarrowing = useCallback(() => {
    if (emptyKind === 'library') return
    handleFiltersChange(clearGalleryNarrowing(filters, emptyKind))
  }, [emptyKind, filters, handleFiltersChange])
  // 登录的人搜不到自己刚出的图：画廊只有公开作品，私有的在素材里（11-19 库走查）——
  // 空态说清这一句，并给一颗带着关键词去素材里搜的键。访客没有素材，不说。
  const { isSignedIn } = useAuth()
  const searchQuery = filters.search.trim()
  const narrowedEmpty =
    emptyKind === 'search'
      ? {
          title: t('noResultsSearchTitle', { query: searchQuery }),
          description: isSignedIn
            ? `${t('noResultsSearchDescription')} ${t('noResultsPrivateHint')}`
            : t('noResultsSearchDescription'),
          action: t('clearSearch'),
        }
      : emptyKind === 'filtered'
        ? {
            title: t('noResultsFilteredTitle'),
            description: t('noResultsFilteredDescription'),
            action: t('clearFilters'),
          }
        : null
  const emptyAction = narrowedEmpty ? (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {emptyKind === 'search' && isSignedIn ? (
        <Button asChild className="rounded-full px-5">
          {/* 素材页认的参数也叫 `search`（assets-page `AssetsPageSearchSchema`）。 */}
          <Link
            href={`${ROUTES.ASSETS}?${new URLSearchParams({ search: searchQuery }).toString()}`}
          >
            {t('searchInAssets')}
          </Link>
        </Button>
      ) : null}
      <Button
        variant={emptyKind === 'search' && isSignedIn ? 'secondary' : 'default'}
        className="rounded-full px-5"
        onClick={clearNarrowing}
      >
        {narrowedEmpty.action}
      </Button>
    </div>
  ) : (
    <Button asChild className="rounded-full px-5">
      <Link href={ROUTES.STUDIO}>{t('emptyAction')}</Link>
    </Button>
  )
  const emptyIcon = narrowedEmpty ? <Search aria-hidden /> : undefined

  /**
   * ♥ 由画廊统一记：卡片与查看器看同一个数。先改（数字跳一下），请求没落库就
   * 退回原样；同一张在飞时不接第二下。
   */
  const likePendingRef = useRef(new Set<string>())
  const patchWork = useCallback(
    (id: string, patch: Partial<GenerationRecord>) => {
      updateGeneration(id, patch)
      updatePromptWork(id, patch)
    },
    [updateGeneration, updatePromptWork],
  )
  const toggleLike = useCallback(
    async (generation: GenerationRecord) => {
      const id = generation.id
      if (likePendingRef.current.has(id)) return
      likePendingRef.current.add(id)
      const previous = {
        isLiked: Boolean(generation.isLiked),
        likeCount: generation.likeCount ?? 0,
      }
      patchWork(id, {
        isLiked: !previous.isLiked,
        likeCount: previous.isLiked
          ? Math.max(previous.likeCount - 1, 0)
          : previous.likeCount + 1,
      })
      try {
        const response = await toggleLikeAPI(id)
        if (response.success && response.data) {
          patchWork(id, {
            isLiked: response.data.liked,
            likeCount: response.data.likeCount,
          })
        } else {
          patchWork(id, previous)
        }
      } catch {
        patchWork(id, previous)
      } finally {
        likePendingRef.current.delete(id)
      }
    },
    [patchWork],
  )
  const handleToggleLike = useCallback(
    (generation: GenerationRecord) => void toggleLike(generation),
    [toggleLike],
  )

  return (
    <>
      {/* 顶栏与图之间 12（owner 2026-10-08）；手机底留空让开底部悬浮玻璃搜索胶囊。 */}
      <div className="flex flex-col gap-3 max-md:pb-20">
        <GalleryHeader
          filters={filters}
          onFiltersChange={handleFiltersChange}
        />

        {/* 换筛选、缓存里没有：静止的灰块（⛔ 先闪一下「空」）；整页没拿到：统一出错模板。 */}
        {generations.length === 0 && error ? (
          <PageLoadError title={error} onRetry={retry} retrying={isLoading} />
        ) : generations.length === 0 && isLoading ? (
          <GallerySkeletonGrid rows={3} />
        ) : filters.view === 'prompts' ? (
          <GalleryPromptList
            generations={generations}
            emptyTitle={narrowedEmpty?.title ?? t('promptsEmptyTitle')}
            emptyDescription={
              narrowedEmpty?.description ?? t('promptsEmptyDescription')
            }
            emptyAction={emptyAction}
            emptyIcon={emptyIcon}
            feedLabel={t('feedLabel')}
            onOpen={isTablet ? undefined : openPromptViewer}
          />
        ) : (
          <GalleryGrid
            generations={generations}
            emptyTitle={narrowedEmpty?.title ?? t('emptyTitle')}
            emptyDescription={
              narrowedEmpty?.description ?? t('emptyDescription')
            }
            emptyAction={emptyAction}
            emptyIcon={emptyIcon}
            feedLabel={t('feedLabel')}
            itemFallbackLabel={t('itemFallbackLabel')}
            onOpen={isTablet ? undefined : openViewer}
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
      {viewing && isPhone ? (
        <GalleryViewer
          phone
          generation={viewing}
          images={images}
          onNavigate={openViewer}
          onClose={closeViewer}
          onToggleLike={handleToggleLike}
        />
      ) : null}
      {viewing && !isPhone ? (
        <GalleryViewer
          generation={viewing}
          images={images}
          onNavigate={openViewer}
          onClose={closeViewer}
          onToggleLike={handleToggleLike}
        />
      ) : null}
    </>
  )
}
