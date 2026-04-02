'use client'

import { memo, useCallback } from 'react'
import { ImagePlus, RotateCcw, Sparkles } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'

import { useStudioGen } from '@/contexts/studio-context'
import { ImageCard } from '@/components/business/ImageCard'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { getGenerationPromptPreview } from '@/lib/studio-remix'
import { Button } from '@/components/ui/button'
import type { GenerationRecord } from '@/types'

function formatDuration(seconds: number): string {
  const min = Math.floor(seconds / 60)
  const sec = seconds % 60
  return min > 0 ? `${min}:${String(sec).padStart(2, '0')}` : `${sec}s`
}

interface GenerationPreviewProps {
  generation: GenerationRecord | null
  isLatestResult?: boolean
  onUseAsReference?: (url: string) => void
  onRemix?: (generation: GenerationRecord) => void
  onRetry?: () => void
}

export const GenerationPreview = memo(function GenerationPreview({
  generation,
  isLatestResult = false,
  onUseAsReference,
  onRemix,
  onRetry,
}: GenerationPreviewProps) {
  const { error, isGenerating, elapsedSeconds } = useStudioGen()
  const t = useTranslations('StudioV3')
  const tModels = useTranslations('Models')
  const format = useFormatter()

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      if (!generation?.url) return
      e.dataTransfer.effectAllowed = 'copy'
      e.dataTransfer.setData(
        'application/x-studio-ref',
        JSON.stringify({ url: generation.url, id: generation.id }),
      )
      e.dataTransfer.setData('text/uri-list', generation.url)
    },
    [generation],
  )

  if (!generation && !isGenerating && !error) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-muted/10 p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
            <ImagePlus className="size-5 text-primary/60" />
          </div>
          <p className="text-sm font-medium text-foreground">
            {t('emptyStateTitle')}
          </p>
          <p className="font-serif text-sm leading-6 text-muted-foreground">
            {t('emptyStateHint')}
          </p>
        </div>
      </div>
    )
  }

  if (isGenerating && !generation) {
    return (
      <div className="rounded-xl overflow-hidden border border-border/40 bg-muted/20">
        <div className="flex flex-col items-center justify-center gap-3 py-12">
          <div className="relative">
            <div className="size-12 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
          </div>
          <p className="text-sm text-muted-foreground font-serif animate-pulse">
            {t('generating')}
          </p>
          {elapsedSeconds > 0 && (
            <p className="text-xs text-muted-foreground font-serif">
              {t('elapsed', { seconds: formatDuration(elapsedSeconds) })}
            </p>
          )}
        </div>
      </div>
    )
  }

  if (!generation) {
    return (
      <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4">
        <p className="text-sm font-medium text-foreground">
          {t('previewErrorTitle')}
        </p>
        <p className="mt-1 font-serif text-sm text-muted-foreground">{error}</p>
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            className="mt-3 rounded-full"
            onClick={onRetry}
          >
            <RotateCcw className="size-3.5" />
            {t('retry')}
          </Button>
        )}
      </div>
    )
  }

  const displayPrompt = getGenerationPromptPreview(generation)
  const modelLabel = getTranslatedModelLabel(tModels, generation.model)
  const canUseAsReference =
    generation.outputType === 'IMAGE' && typeof onUseAsReference === 'function'
  const canRemix =
    generation.outputType === 'IMAGE' && typeof onRemix === 'function'

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded-full border border-border/60 bg-background/80 px-2 py-1 text-2xs font-semibold tracking-wide text-muted-foreground">
            {isLatestResult ? t('latestResult') : t('historySelection')}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {modelLabel}
          </span>
        </div>
        <span className="shrink-0 text-2xs text-muted-foreground">
          {format.dateTime(new Date(generation.createdAt), {
            month: 'short',
            day: 'numeric',
          })}
        </span>
      </div>

      <div
        className="group relative rounded-xl overflow-hidden cursor-grab active:cursor-grabbing"
        draggable={generation.outputType === 'IMAGE'}
        onDragStart={handleDragStart}
      >
        <ImageCard generation={generation} />

        {isGenerating && (
          <div className="pointer-events-none absolute inset-x-3 top-3 rounded-full bg-background/90 px-3 py-2 backdrop-blur-sm shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-foreground">
                {t('generating')}
              </p>
              {elapsedSeconds > 0 && (
                <p className="text-2xs text-muted-foreground">
                  {t('elapsed', { seconds: formatDuration(elapsedSeconds) })}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-foreground">
            {t('previewErrorTitle')}
          </p>
          <p className="mt-1 font-serif text-sm text-muted-foreground">
            {error}
          </p>
          {onRetry && !isGenerating && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3 rounded-full"
              onClick={onRetry}
            >
              <RotateCcw className="size-3.5" />
              {t('retry')}
            </Button>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-border/50 bg-background/70 p-4">
        <p className="text-2xs font-semibold uppercase tracking-widest text-muted-foreground">
          {t('promptPreviewLabel')}
        </p>
        <p className="mt-2 line-clamp-4 font-serif text-sm leading-6 text-foreground">
          {displayPrompt}
        </p>
      </div>

      {(canUseAsReference || canRemix) && (
        <div className="flex flex-wrap gap-2">
          {canUseAsReference && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => onUseAsReference?.(generation.url)}
            >
              <ImagePlus className="size-3.5" />
              {t('useAsReference')}
            </Button>
          )}
          {canRemix && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => onRemix?.(generation)}
            >
              <Sparkles className="size-3.5" />
              {t('remix')}
            </Button>
          )}
        </div>
      )}
    </div>
  )
})
