'use client'

import { memo, useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { Heart, RefreshCw, Download, Grid3X3, LayoutGrid } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'
import { useVirtualizer } from '@tanstack/react-virtual'

import {
  useStudioForm,
  useStudioData,
  useStudioGen,
} from '@/contexts/studio-context'
import { StudioLightbox } from './StudioLightbox'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { STUDIO_PROMPT_TEXTAREA_ID } from '@/constants/studio'
import { cn } from '@/lib/utils'
import type { GenerationRecord } from '@/types'
import { buildStudioRemixPreset } from '@/lib/studio-remix'

const COLS_WIDE = 5
const COLS_DESKTOP = 4
const COLS_TABLET = 3
const COLS_MOBILE = 2
const GAP = 8

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
  const { dispatch } = useStudioForm()
  const { projects, imageUpload } = useStudioData()
  const { isGenerating, lastGeneration } = useStudioGen()
  const { modelOptions } = useImageModelOptions()
  const t = useTranslations('StudioV3')
  const tProj = useTranslations('Projects')
  const COLS = useResponsiveCols()

  const [lightboxIndex, setLightboxIndex] = useState(-1)
  const [filter, setFilter] = useState<'all' | 'favorites' | 'today'>('all')
  const [layout, setLayout] = useState<'grid' | 'masonry'>('masonry')

  // Merge latest generation into history
  const allGenerations = useMemo(() => {
    if (!lastGeneration) return projects.history
    const filtered = projects.history.filter((g) => g.id !== lastGeneration.id)
    return [lastGeneration, ...filtered]
  }, [lastGeneration, projects.history])

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
      dispatch({ type: 'SET_OUTPUT_TYPE', payload: 'image' })
      dispatch({ type: 'SET_WORKFLOW_MODE', payload: 'quick' })
      dispatch({ type: 'SET_PROMPT', payload: preset.prompt })
      dispatch({ type: 'SET_ASPECT_RATIO', payload: preset.aspectRatio })
      dispatch({ type: 'CLOSE_ALL_PANELS' })
      if (preset.optionId) {
        dispatch({ type: 'SET_OPTION_ID', payload: preset.optionId })
      }
      const promptField = document.getElementById(STUDIO_PROMPT_TEXTAREA_ID)
      if (promptField instanceof HTMLTextAreaElement) {
        promptField.focus()
      }
    },
    [dispatch, modelOptions],
  )

  const handleDragStart = useCallback(
    (e: React.DragEvent, gen: GenerationRecord) => {
      if (gen.outputType !== 'IMAGE' || !gen.url) {
        e.preventDefault()
        return
      }
      e.dataTransfer.effectAllowed = 'copy'
      e.dataTransfer.setData(
        'application/x-studio-ref',
        JSON.stringify({ url: gen.url, id: gen.id }),
      )
      e.dataTransfer.setData('text/uri-list', gen.url)
    },
    [],
  )

  const isEmpty = !isGenerating && allGenerations.length === 0

  // Chunk generations into rows of COLS
  const rows = useMemo(() => {
    const result: GenerationRecord[][] = []
    for (let i = 0; i < allGenerations.length; i += COLS) {
      result.push(allGenerations.slice(i, i + COLS))
    }
    return result
  }, [allGenerations])

  // Feed mode: no internal virtualization, parent scroll handles it
  const scrollRef = useRef<HTMLDivElement>(null)

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
              aria-label="Grid layout"
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
              aria-label="Masonry layout"
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
                  ? 'All'
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
        <div ref={scrollRef}>
          {layout === 'masonry' ? (
            <div
              className="studio-masonry-grid"
              style={{ columns: COLS, gap: GAP }}
            >
              {allGenerations.map((gen, idx) => (
                <GalleryItem
                  key={gen.id}
                  gen={gen}
                  isLatest={gen.id === lastGeneration?.id}
                  onDragStart={handleDragStart}
                  onClick={() => setLightboxIndex(idx)}
                  onRemix={handleRemix}
                  onUseAsRef={handleUseAsRef}
                  t={t}
                  preserveAspectRatio
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
              {allGenerations.map((gen, idx) => (
                <GalleryItem
                  key={gen.id}
                  gen={gen}
                  isLatest={gen.id === lastGeneration?.id}
                  onDragStart={handleDragStart}
                  onClick={() => setLightboxIndex(idx)}
                  onRemix={handleRemix}
                  onUseAsRef={handleUseAsRef}
                  t={t}
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
        generations={allGenerations}
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
  onDragStart: (e: React.DragEvent, gen: GenerationRecord) => void
  onClick: () => void
  onRemix: (gen: GenerationRecord) => void
  onUseAsRef: (url: string) => Promise<void>
  t: ReturnType<typeof useTranslations>
  preserveAspectRatio?: boolean
}

const GalleryItem = memo(function GalleryItem({
  gen,
  isLatest,
  onDragStart,
  onClick,
  onRemix,
  onUseAsRef,
  t,
  preserveAspectRatio,
}: GalleryItemProps) {
  return (
    <div
      className={cn(
        'group relative cursor-pointer overflow-hidden rounded-lg border transition-transform duration-200 hover:-translate-y-0.5',
        !preserveAspectRatio && 'aspect-square',
        preserveAspectRatio && 'break-inside-avoid mb-1.5',
        isLatest ? 'border-2 border-primary' : 'border-border/40',
      )}
      draggable={gen.outputType === 'IMAGE' && !!gen.url}
      onDragStart={(e) => onDragStart(e, gen)}
      onClick={onClick}
    >
      {gen.url ? (
        preserveAspectRatio ? (
          <Image
            src={gen.url}
            alt={gen.prompt?.slice(0, 50) ?? ''}
            width={gen.width ?? 512}
            height={gen.height ?? 512}
            sizes="20vw"
            className="w-full h-auto"
            unoptimized
          />
        ) : (
          <Image
            src={gen.url}
            alt={gen.prompt?.slice(0, 50) ?? ''}
            fill
            sizes="20vw"
            className="object-cover"
            unoptimized
          />
        )
      ) : (
        <div className="flex size-full items-center justify-center bg-muted/30">
          <span className="text-xs text-muted-foreground">No image</span>
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
          onClick={(e) => {
            e.stopPropagation()
          }}
        />
        <GalleryAction
          icon={RefreshCw}
          onClick={(e) => {
            e.stopPropagation()
            onRemix(gen)
          }}
        />
        {gen.url && (
          <GalleryAction
            icon={Download}
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
        <p className="text-3xs text-white/70">{gen.model}</p>
      </div>
    </div>
  )
})

// ── Gallery Action Button ────────────────────────────────────────────

function GalleryAction({
  icon: Icon,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  onClick: (e: React.MouseEvent) => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-md bg-black/50 text-white backdrop-blur-sm transition-all hover:bg-primary/80 hover:scale-110 active:scale-90"
      style={{ transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
    >
      <Icon className="size-3.5" />
    </button>
  )
}
