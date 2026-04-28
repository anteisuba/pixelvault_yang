'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Heart, RefreshCw, Download, Grid3X3, LayoutGrid } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { OptimizedImage } from '@/components/ui/optimized-image'

import {
  useStudioForm,
  useStudioData,
  useStudioGen,
} from '@/contexts/studio-context'
import { StudioLightbox } from './StudioLightbox'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { useLike } from '@/hooks/use-like'
import { batchGetLikesAPI } from '@/lib/api-client/profile'
import { STUDIO_PROMPT_TEXTAREA_ID } from '@/constants/studio'
import { cn } from '@/lib/utils'
import type { GenerationRecord } from '@/types'
import { buildStudioRemixPreset } from '@/lib/studio-remix'
import { useStudioDraggable } from '@/hooks/use-studio-draggable'

const COLS_WIDE = 5
const COLS_DESKTOP = 4
const COLS_TABLET = 3
const COLS_MOBILE = 2
const GAP = 8
const EAGER_HISTORY_IMAGE_COUNT = 1

function useResponsiveCols() {
  const [cols, setCols] = useState(COLS_DESKTOP)

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth
      setCols(
        w < 640
          ? COLS_MOBILE
          : w < 1024
            ? COLS_TABLET
            : w < 1440
              ? COLS_DESKTOP
              : COLS_WIDE,
      )
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return cols
}

export const StudioGallery = memo(function StudioGallery() {
  const { state, dispatch } = useStudioForm()
  const { projects, imageUpload } = useStudioData()
  const { isGenerating, lastGeneration } = useStudioGen()
  const { modelOptions } = useImageModelOptions()
  const t = useTranslations('StudioV3')
  const tProj = useTranslations('Projects')
  const COLS = useResponsiveCols()

  const [lightboxIndex, setLightboxIndex] = useState(-1)
  const [filter, setFilter] = useState<'all' | 'favorites' | 'today'>('all')
  const [layout, setLayout] = useState<'grid' | 'masonry'>('masonry')
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const fetchedIdsRef = useRef<string>('')

  // Drive the server-side history filter from the current outputType so each
  // mode only fetches its own type. (A stale-response guard in useProjects
  // prevents the initial default 'all' fetch from overwriting the first
  // mode-specific fetch — see use-projects.ts loadHistoryReqIdRef.)
  const setHistoryTypeFilter = projects.setHistoryTypeFilter
  useEffect(() => {
    setHistoryTypeFilter(state.outputType)
  }, [state.outputType, setHistoryTypeFilter])

  // Belt-and-suspenders client filter (case-insensitive) — covers:
  // 1. In-flight server fetch race on mode switch (stale data briefly visible).
  // 2. Any legacy records with non-canonical casing (e.g. "image" vs "IMAGE").
  const expectedType =
    state.outputType === 'video'
      ? 'VIDEO'
      : state.outputType === 'audio'
        ? 'AUDIO'
        : 'IMAGE'
  const matchesMode = useCallback(
    (g: GenerationRecord) =>
      String(g.outputType).toUpperCase() === expectedType,
    [expectedType],
  )
  const allGenerations = useMemo(() => {
    const historyByType = projects.history.filter(matchesMode)
    if (!lastGeneration || !matchesMode(lastGeneration)) {
      return historyByType
    }
    const filtered = historyByType.filter((g) => g.id !== lastGeneration.id)
    return [lastGeneration, ...filtered]
  }, [lastGeneration, projects.history, matchesMode])

  // Batch-fetch liked status when generations change
  useEffect(() => {
    const ids = allGenerations.map((g) => g.id)
    const key = ids.join(',')
    if (!ids.length || key === fetchedIdsRef.current) return
    fetchedIdsRef.current = key
    void batchGetLikesAPI(ids).then((res) => {
      if (res.success && res.data) {
        setLikedIds(new Set(res.data.likedIds))
      }
    })
  }, [allGenerations])

  // Like toggle handler
  const handleLikeSuccess = useCallback(
    (generationId: string, liked: boolean) => {
      setLikedIds((prev) => {
        const next = new Set(prev)
        if (liked) next.add(generationId)
        else next.delete(generationId)
        return next
      })
    },
    [],
  )
  const { toggle: toggleLike, isPending: isLikePending } =
    useLike(handleLikeSuccess)

  // Apply filter
  const filteredGenerations = useMemo(() => {
    if (filter === 'all') return allGenerations
    if (filter === 'favorites')
      return allGenerations.filter((g) => likedIds.has(g.id))
    // today
    const todayStr = new Date().toISOString().slice(0, 10)
    return allGenerations.filter((g) => {
      const created = g.createdAt
        ? new Date(g.createdAt).toISOString().slice(0, 10)
        : ''
      return created === todayStr
    })
  }, [allGenerations, filter, likedIds])

  const handleUseAsRef = useCallback(
    async (url: string) => {
      await imageUpload.addFromUrl(url)
      dispatch({ type: 'OPEN_PANEL', payload: 'refImage' })
    },
    [imageUpload, dispatch],
  )

  const handleRemix = useCallback(
    (generation: GenerationRecord) => {
      const preset = buildStudioRemixPreset(generation, modelOptions)
      // Preserve source outputType so remixing a video/audio stays in that mode
      const sourceOutputType =
        generation.outputType === 'VIDEO'
          ? 'video'
          : generation.outputType === 'AUDIO'
            ? 'audio'
            : 'image'
      dispatch({ type: 'SET_OUTPUT_TYPE', payload: sourceOutputType })
      dispatch({ type: 'SET_WORKFLOW_MODE', payload: 'quick' })
      dispatch({ type: 'SET_PROMPT', payload: preset.prompt })
      dispatch({ type: 'SET_ASPECT_RATIO', payload: preset.aspectRatio })
      dispatch({ type: 'CLOSE_ALL_PANELS' })
      if (preset.optionId) {
        dispatch({ type: 'SET_OPTION_ID', payload: preset.optionId })
      }
      if (
        preset.advancedParams &&
        Object.keys(preset.advancedParams).length > 0
      ) {
        dispatch({
          type: 'SET_ADVANCED_PARAMS',
          payload: preset.advancedParams,
        })
      }
      const promptField = document.getElementById(STUDIO_PROMPT_TEXTAREA_ID)
      if (promptField instanceof HTMLTextAreaElement) {
        promptField.focus()
      }
    },
    [dispatch, modelOptions],
  )

  const isEmpty = !isGenerating && allGenerations.length === 0

  return (
    <section className="studio-history space-y-2">
      {/* Header + filters + layout toggle */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-display">
          {tProj('history')}
        </h3>
        <div className="flex items-center gap-2">
          {/* Layout toggle */}
          <div className="flex rounded-md border border-border/40 p-0.5">
            <button
              type="button"
              onClick={() => setLayout('grid')}
              className={cn(
                'flex size-7 items-center justify-center rounded-sm transition-colors',
                layout === 'grid'
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-muted',
              )}
              aria-label={t('gridLayout')}
            >
              <Grid3X3 className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setLayout('masonry')}
              className={cn(
                'flex size-7 items-center justify-center rounded-sm transition-colors',
                layout === 'masonry'
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-muted',
              )}
              aria-label={t('masonryLayout')}
            >
              <LayoutGrid className="size-3.5" />
            </button>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1">
            {(['all', 'favorites', 'today'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs transition-colors',
                  filter === f
                    ? 'bg-foreground text-background font-medium'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {f === 'all'
                  ? tProj('filterAll')
                  : f === 'favorites'
                    ? t('favorites')
                    : t('today')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Empty state */}
      {isEmpty && (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            {t('emptyStateTitle')}
          </p>
        </div>
      )}

      {/* Gallery feed — masonry or grid */}
      {!isEmpty && (
        <div>
          {layout === 'masonry' ? (
            <div
              className="studio-masonry-grid"
              style={{ columns: COLS, gap: GAP }}
            >
              {filteredGenerations.map((gen, idx) => (
                <GalleryItem
                  key={gen.id}
                  gen={gen}
                  isLatest={gen.id === lastGeneration?.id}
                  isLiked={likedIds.has(gen.id)}
                  onToggleLike={toggleLike}
                  isLikePending={isLikePending}
                  onClick={() => setLightboxIndex(idx)}
                  onRemix={handleRemix}
                  onUseAsRef={handleUseAsRef}
                  t={t}
                  preserveAspectRatio
                  priority={idx < EAGER_HISTORY_IMAGE_COUNT}
                />
              ))}
            </div>
          ) : (
            <div
              className="grid"
              style={{
                gridTemplateColumns: `repeat(${COLS}, 1fr)`,
                gap: GAP,
              }}
            >
              {filteredGenerations.map((gen, idx) => (
                <GalleryItem
                  key={gen.id}
                  gen={gen}
                  isLatest={gen.id === lastGeneration?.id}
                  isLiked={likedIds.has(gen.id)}
                  onToggleLike={toggleLike}
                  isLikePending={isLikePending}
                  onClick={() => setLightboxIndex(idx)}
                  onRemix={handleRemix}
                  onUseAsRef={handleUseAsRef}
                  t={t}
                  priority={idx < EAGER_HISTORY_IMAGE_COUNT}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Load more trigger */}
      {projects.historyHasMore && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={projects.loadMoreHistory}
            disabled={projects.isLoadingHistory}
            className="rounded-lg border border-dashed border-border/40 px-5 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
          >
            {projects.isLoadingHistory ? '...' : tProj('historyLoadMore')}
          </button>
        </div>
      )}

      {/* Lightbox */}
      <StudioLightbox
        generations={filteredGenerations}
        index={lightboxIndex}
        open={lightboxIndex >= 0}
        onClose={() => setLightboxIndex(-1)}
      />
    </section>
  )
})

// ── Gallery Item ────────────────────────────────────────────────────

interface GalleryItemProps {
  gen: GenerationRecord
  isLatest: boolean
  isLiked: boolean
  onToggleLike: (generationId: string) => Promise<void>
  isLikePending: boolean
  onClick: () => void
  onRemix: (gen: GenerationRecord) => void
  onUseAsRef: (url: string) => Promise<void>
  t: ReturnType<typeof useTranslations>
  preserveAspectRatio?: boolean
  priority?: boolean
}

const GalleryItem = memo(function GalleryItem({
  gen,
  isLatest,
  isLiked,
  onToggleLike,
  isLikePending,
  onClick,
  onRemix,
  onUseAsRef,
  t,
  preserveAspectRatio,
  priority,
}: GalleryItemProps) {
  const dragRef = useStudioDraggable({
    url: gen.url ?? undefined,
    generationId: gen.id,
    outputType: gen.outputType,
  })

  return (
    <div
      ref={dragRef}
      className={cn(
        'group relative cursor-pointer overflow-hidden rounded-lg border transition-transform duration-200 hover:-translate-y-0.5',
        !preserveAspectRatio && 'aspect-square',
        preserveAspectRatio && 'break-inside-avoid mb-1.5',
        isLatest ? 'border-2 border-primary' : 'border-border/40',
      )}
      onClick={onClick}
    >
      {gen.outputType === 'AUDIO' ? (
        <div className="flex size-full items-center justify-center bg-muted/20 p-3">
          <span className="text-2xl">🎵</span>
        </div>
      ) : gen.outputType === 'VIDEO' && gen.url ? (
        <video
          src={gen.url}
          muted
          playsInline
          preload="metadata"
          className={cn(
            preserveAspectRatio
              ? 'w-full h-auto'
              : 'w-full h-full object-cover',
          )}
        />
      ) : gen.url ? (
        preserveAspectRatio ? (
          <OptimizedImage
            src={gen.url}
            alt={gen.prompt?.slice(0, 50) ?? ''}
            width={gen.width ?? 512}
            height={gen.height ?? 512}
            sizes="20vw"
            className="w-full h-auto"
            loading={priority ? 'eager' : 'lazy'}
          />
        ) : (
          <OptimizedImage
            src={gen.url}
            alt={gen.prompt?.slice(0, 50) ?? ''}
            fill
            sizes="20vw"
            className="object-cover"
            loading={priority ? 'eager' : 'lazy'}
          />
        )
      ) : (
        <div className="flex size-full items-center justify-center bg-muted/30">
          <span className="text-xs text-muted-foreground">{t('noImage')}</span>
        </div>
      )}

      {/* Latest badge */}
      {isLatest && (
        <span className="absolute left-1.5 top-1.5 rounded bg-primary px-1.5 py-0.5 text-3xs font-semibold text-primary-foreground">
          {t('latestResult')}
        </span>
      )}

      {/* Hover actions */}
      <div
        className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 translate-y-[-4px] transition-all duration-200 group-hover:opacity-100 group-hover:translate-y-0"
        style={{
          transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <GalleryAction
          icon={Heart}
          label={isLiked ? t('unlike') : t('like')}
          active={isLiked}
          onClick={(e) => {
            e.stopPropagation()
            if (!isLikePending) void onToggleLike(gen.id)
          }}
        />
        <GalleryAction
          icon={RefreshCw}
          label={t('toolRemix')}
          onClick={(e) => {
            e.stopPropagation()
            onRemix(gen)
          }}
        />
        {gen.url && (
          <GalleryAction
            icon={Download}
            label={t('useAsReference')}
            onClick={(e) => {
              e.stopPropagation()
              void onUseAsRef(gen.url!)
            }}
          />
        )}
      </div>

      {/* Bottom meta */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-2 pb-1.5 pt-5">
        <p className="truncate text-3xs leading-snug text-white">
          {gen.prompt?.slice(0, 60)}
        </p>
      </div>
    </div>
  )
})

// ── Gallery Action Button ────────────────────────────────────────────

const GalleryAction = memo(function GalleryAction({
  icon: Icon,
  label,
  onClick,
  active,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: (e: React.MouseEvent) => void
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex size-7 items-center justify-center rounded-md backdrop-blur-sm transition-all hover:scale-110 active:scale-90',
        active
          ? 'bg-primary/80 text-white'
          : 'bg-black/50 text-white hover:bg-primary/80',
      )}
      aria-label={label}
      style={{ transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
    >
      <Icon className={cn('size-3.5', active && 'fill-current')} />
    </button>
  )
})
