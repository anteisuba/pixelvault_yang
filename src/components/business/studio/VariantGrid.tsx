'use client'

import { memo } from 'react'
import { Check, Loader2, AlertTriangle } from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { RunItem } from '@/types'
import { ImageCard } from '@/components/business/ImageCard'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface VariantGridProps {
  items: RunItem[]
  selectedItemId: string | null
  onSelect: (generationId: string) => void
}

export const VariantGrid = memo(function VariantGrid({
  items,
  selectedItemId,
  onSelect,
}: VariantGridProps) {
  const t = useTranslations('StudioV3')

  return (
    <div
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      role="radiogroup"
      aria-label={t('variantSelectWinner')}
    >
      {items.map((item, idx) => {
        const isSelected =
          selectedItemId != null && item.generation?.id === selectedItemId
        const isCompleted =
          item.status === 'completed' && item.generation != null

        return (
          <div
            key={item.id}
            role="radio"
            aria-checked={isSelected}
            aria-label={`${t('generating').replace('...', '')} ${idx + 1}: ${item.status}`}
            className={cn(
              'group relative overflow-hidden rounded-xl border border-border/60 bg-muted/10 transition-all',
              isSelected && 'ring-2 ring-primary border-primary/40',
              isCompleted &&
                !isSelected &&
                'hover:border-primary/30 cursor-pointer',
            )}
            onClick={() => {
              if (isCompleted && item.generation) {
                onSelect(item.generation.id)
              }
            }}
          >
            {/* Generating */}
            {item.status === 'generating' && (
              <div className="flex flex-col items-center justify-center gap-2 py-16">
                <Loader2 className="size-6 animate-spin text-primary/60" />
                <p className="text-xs text-muted-foreground font-serif">
                  {t('generating')}
                </p>
              </div>
            )}

            {/* Failed */}
            {item.status === 'failed' && (
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-16">
                <AlertTriangle className="size-5 text-destructive/60" />
                <p className="text-center text-xs text-muted-foreground font-serif">
                  {item.error ?? t('generateFailed')}
                </p>
              </div>
            )}

            {/* Completed */}
            {isCompleted && item.generation && (
              <div className="animate-in fade-in slide-in-from-bottom-1 duration-300">
                <div className="[&_img]:object-contain">
                  <ImageCard generation={item.generation} />
                </div>

                {/* Selection indicator */}
                {isSelected && (
                  <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-primary px-2 py-1 text-2xs font-medium text-primary-foreground shadow-sm">
                    <Check className="size-3" />
                    {t('variantSelected')}
                  </div>
                )}

                {/* Hover select button */}
                {!isSelected && (
                  <div className="absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-background/80 to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full bg-background/90 backdrop-blur-sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (item.generation) {
                          onSelect(item.generation.id)
                        }
                      }}
                    >
                      <Check className="size-3.5" />
                      {t('variantSelectWinner')}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
})
