'use client'

import { useCallback } from 'react'
import { Clock, ImageIcon, Film, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'

import type { GenerationRecord } from '@/types'
import { cn } from '@/lib/utils'

interface HistoryPanelProps {
  generations: GenerationRecord[]
  total: number
  hasMore: boolean
  isLoading: boolean
  onLoadMore: () => void
  onSelect?: (generation: GenerationRecord) => void
  onOpenDetail?: (generation: GenerationRecord) => void
  selectedId?: string | null
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
}: HistoryPanelProps) {
  const t = useTranslations('Projects')

  const handleSelect = useCallback(
    (gen: GenerationRecord) => {
      onSelect?.(gen)
    },
    [onSelect],
  )

  const handleDragStart = useCallback(
    (e: React.DragEvent, gen: GenerationRecord) => {
      // Only allow dragging images, not videos
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

      {/* Thumbnail grid — auto-fill adapts when preview is collapsed */}
      <div className="grid grid-cols-3 sm:grid-cols-[repeat(auto-fill,minmax(5rem,1fr))] gap-1.5">
        {generations.map((gen) => (
          <button
            key={gen.id}
            type="button"
            onClick={() => handleSelect(gen)}
            onDoubleClick={() => onOpenDetail?.(gen)}
            draggable={gen.outputType === 'IMAGE' && !!gen.url}
            onDragStart={(e) => handleDragStart(e, gen)}
            className={cn(
              'group relative aspect-square overflow-hidden rounded-md border border-border/40 bg-muted/30 transition-all',
              'hover:border-primary/30 hover:shadow-sm',
              onSelect && 'cursor-pointer',
              gen.outputType === 'IMAGE' &&
                gen.url &&
                'cursor-grab active:cursor-grabbing',
              selectedId === gen.id &&
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
              ) : (
                <Image
                  src={gen.url}
                  alt={gen.prompt?.slice(0, 50) ?? ''}
                  fill
                  sizes="80px"
                  className="object-cover transition-transform group-hover:scale-105"
                  unoptimized
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
        ))}

        {/* Loading skeletons */}
        {isLoading &&
          generations.length === 0 &&
          Array.from({ length: 6 }).map((_, i) => (
            <div
              key={`skeleton-${i}`}
              className="aspect-square animate-pulse rounded-md bg-muted/50"
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
