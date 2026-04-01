'use client'

import { memo, useCallback } from 'react'
import { ImagePlus } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useStudioGen } from '@/contexts/studio-context'
import { ImageCard } from '@/components/business/ImageCard'
import { Button } from '@/components/ui/button'

function formatDuration(seconds: number): string {
  const min = Math.floor(seconds / 60)
  const sec = seconds % 60
  return min > 0 ? `${min}:${String(sec).padStart(2, '0')}` : `${sec}s`
}

interface GenerationPreviewProps {
  onUseAsReference?: (url: string) => void
}

export const GenerationPreview = memo(function GenerationPreview({
  onUseAsReference,
}: GenerationPreviewProps) {
  const { isGenerating, lastGeneration, elapsedSeconds } = useStudioGen()
  const t = useTranslations('StudioV3')

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      if (!lastGeneration?.url) return
      e.dataTransfer.effectAllowed = 'copy'
      e.dataTransfer.setData(
        'application/x-studio-ref',
        JSON.stringify({ url: lastGeneration.url, id: lastGeneration.id }),
      )
      e.dataTransfer.setData('text/uri-list', lastGeneration.url)
    },
    [lastGeneration],
  )

  // Empty state — hidden (dynamic layout hides the whole right panel)
  if (!lastGeneration && !isGenerating) {
    return null
  }

  // Generating
  if (isGenerating && !lastGeneration) {
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

  // Result — draggable + "use as reference" button
  if (lastGeneration) {
    return (
      <div
        className="group relative rounded-xl overflow-hidden border border-border/40 max-h-[500px] cursor-grab active:cursor-grabbing"
        draggable
        onDragStart={handleDragStart}
      >
        <ImageCard generation={lastGeneration} />

        {/* Hover overlay: "Use as reference" button */}
        {onUseAsReference && lastGeneration.outputType === 'IMAGE' && (
          <div className="absolute inset-0 flex items-end justify-end bg-gradient-to-t from-black/30 to-transparent opacity-0 transition-opacity group-hover:opacity-100 pointer-events-none">
            <Button
              variant="secondary"
              size="sm"
              className="m-3 gap-1.5 pointer-events-auto bg-background/90 backdrop-blur-sm shadow-md"
              onClick={(e) => {
                e.stopPropagation()
                onUseAsReference(lastGeneration.url)
              }}
            >
              <ImagePlus className="size-3.5" />
              {t('useAsReference')}
            </Button>
          </div>
        )}
      </div>
    )
  }

  return null
})
