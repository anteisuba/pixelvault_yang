'use client'

import { memo } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { RunItem } from '@/types'
import { cn } from '@/lib/utils'

interface AudioVariantGridProps {
  items: RunItem[]
}

/**
 * AudioVariantGrid — A/B compare grid for audio runs (SFX ×N, or emotion
 * compare). Each tile is an inline player so variants can be auditioned side by
 * side; unlike the image VariantGrid there's no "pick a winner" — the value is
 * hearing them together.
 */
export const AudioVariantGrid = memo(function AudioVariantGrid({
  items,
}: AudioVariantGridProps) {
  const t = useTranslations('StudioV3')

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map((item, idx) => {
        const isCompleted =
          item.status === 'completed' && item.generation != null

        return (
          <div
            key={item.id}
            className={cn(
              'flex min-h-28 flex-col justify-center gap-2 rounded-xl border border-border/60 bg-muted/10 p-4',
            )}
          >
            <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground/70">
              {`#${idx + 1}`}
            </span>

            {item.status === 'generating' && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin text-primary/60" />
                <span className="font-serif text-xs">{t('generating')}</span>
              </div>
            )}

            {item.status === 'failed' && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <AlertTriangle className="size-4 text-destructive/60" />
                <span className="font-serif text-xs">
                  {item.error ?? t('generateFailed')}
                </span>
              </div>
            )}

            {isCompleted && item.generation && (
              <div className="animate-in fade-in space-y-1.5 duration-300">
                <audio
                  controls
                  preload="none"
                  src={item.generation.url}
                  className="w-full"
                />
                {item.generation.prompt && (
                  <p className="line-clamp-2 text-2xs text-muted-foreground">
                    {item.generation.prompt}
                  </p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
})
