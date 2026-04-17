'use client'

import { memo, useCallback } from 'react'
import { Clock, ImageIcon, Film, Loader2, Music } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'

import type { GenerationRecord } from '@/types'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { useStudioDraggable } from '@/hooks/use-studio-draggable'

const TYPE_FILTERS = ['all', 'image', 'video', 'audio'] as const

interface HistoryPanelProps {
  generations: GenerationRecord[]
  total: number
  hasMore: boolean
  isLoading: boolean
  onLoadMore: () => void
  onSelect?: (generation: GenerationRecord) => void
  onOpenDetail?: (generation: GenerationRecord) => void
  selectedId?: string | null
  typeFilter?: string
  onTypeFilterChange?: (type: string) => void
}

export function HistoryPanel({
  generations,
  total,
  hasMore,
  isLoading,
  onLoadMore,
  onSelect,
  onOpenDetail,
  selectedId,
  typeFilter = 'all',
  onTypeFilterChange,
}: HistoryPanelProps) {
  const t = useTranslations('Projects')

  const handleSelect = useCallback(
    (gen: GenerationRecord) => {
      onSelect?.(gen)
    },
    [onSelect],
  )

  if (!isLoading && generations.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <Clock className="size-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">{t('historyEmpty')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">{t('history')}</h3>
        {total > 0 && (
          <span className="text-2xs text-muted-foreground">
            {t('generationCount', { count: total })}
          </span>
        )}
      </div>

      {/* Type filter tabs */}
      {onTypeFilterChange && (
        <div className="flex gap-1 rounded-lg bg-muted/30 p-0.5">
          {TYPE_FILTERS.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => onTypeFilterChange(type)}
              className={cn(
                'flex-1 rounded-md px-2 py-1 text-2xs font-medium transition-colors',
                typeFilter === type
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t(
                `filter${type.charAt(0).toUpperCase()}${type.slice(1)}` as
                  | 'filterAll'
                  | 'filterImage'
                  | 'filterVideo'
                  | 'filterAudio',
              )}
            </button>
          ))}
        </div>
      )}

      {/* Thumbnail grid — auto-fill adapts when preview is collapsed */}
      <div className="grid grid-cols-3 sm:grid-cols-[repeat(auto-fill,minmax(5rem,1fr))] gap-1.5">
        {generations.map((gen) => (
          <HistoryItem
            key={gen.id}
            gen={gen}
            isSelected={selectedId === gen.id}
            onSelect={onSelect ? handleSelect : undefined}
            onOpenDetail={onOpenDetail}
          />
        ))}

        {/* Loading skeletons */}
        {isLoading &&
          generations.length === 0 &&
          Array.from({ length: 6 }).map((_, i) => (
            <Skeleton
              key={`skeleton-${i}`}
              className="aspect-square rounded-md"
            />
          ))}
      </div>

      {/* Load more */}
      {hasMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={isLoading}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border/40 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          {isLoading ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            t('historyLoadMore')
          )}
        </button>
      )}
    </div>
  )
}

// ── Per-item component (needed so useStudioDraggable can be called per item) ──

const HistoryItem = memo(function HistoryItem({
  gen,
  isSelected,
  onSelect,
  onOpenDetail,
}: {
  gen: GenerationRecord
  isSelected: boolean
  onSelect?: (gen: GenerationRecord) => void
  onOpenDetail?: (gen: GenerationRecord) => void
}) {
  const dragRef = useStudioDraggable<HTMLButtonElement>({
    url: gen.url ?? undefined,
    generationId: gen.id,
    outputType: gen.outputType,
  })

  return (
    <button
      ref={dragRef}
      type="button"
      onClick={() => onSelect?.(gen)}
      onDoubleClick={() => onOpenDetail?.(gen)}
      className={cn(
        'group relative aspect-square overflow-hidden rounded-md border border-border/40 bg-muted/30 transition-all',
        'hover:border-primary/30 hover:shadow-sm',
        onSelect && 'cursor-pointer',
        gen.outputType === 'IMAGE' &&
          gen.url &&
          'cursor-grab active:cursor-grabbing',
        isSelected &&
          'border-primary/40 ring-2 ring-primary/20 shadow-sm shadow-primary/10',
      )}
    >
      {gen.url ? (
        gen.outputType === 'VIDEO' ? (
          <div className="relative size-full">
            <div className="flex size-full items-center justify-center bg-muted/50">
              <Film className="size-5 text-muted-foreground/60" />
            </div>
            <div className="absolute bottom-0.5 right-0.5 rounded bg-black/50 px-1 py-0.5">
              <Film className="size-2.5 text-white" />
            </div>
          </div>
        ) : gen.outputType === 'AUDIO' ? (
          <div className="relative size-full">
            <div className="flex size-full items-center justify-center bg-muted/50">
              <Music className="size-5 text-muted-foreground/60" />
            </div>
            <div className="absolute bottom-0.5 right-0.5 rounded bg-black/50 px-1 py-0.5">
              <Music className="size-2.5 text-white" />
            </div>
          </div>
        ) : (
          <Image
            src={gen.url}
            alt={gen.prompt?.slice(0, 50) ?? ''}
            fill
            sizes="80px"
            className="object-cover transition-transform group-hover:scale-105"
            loading="lazy"
          />
        )
      ) : (
        <div className="flex size-full items-center justify-center">
          <ImageIcon className="size-5 text-muted-foreground/40" />
        </div>
      )}

      {/* Hover overlay with model name */}
      <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/50 to-transparent opacity-0 transition-opacity group-hover:opacity-100">
        <span className="truncate px-1 pb-1 text-3xs text-white">
          {gen.model}
        </span>
      </div>
    </button>
  )
})
