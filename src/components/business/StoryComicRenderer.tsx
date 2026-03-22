'use client'

import type { StoryPanelRecord } from '@/types'
import { cn } from '@/lib/utils'

interface StoryComicRendererProps {
  panels: StoryPanelRecord[]
}

export function StoryComicRenderer({ panels }: StoryComicRendererProps) {
  return (
    <div
      className="grid gap-3"
      style={{
        gridTemplateColumns: panels.length === 1 ? '1fr' : 'repeat(2, 1fr)',
      }}
    >
      {panels.map((panel, index) => {
        // First and last panels can be full-width for emphasis
        const isWide =
          panels.length > 2 && (index === 0 || index === panels.length - 1)

        return (
          <div
            key={panel.id}
            className={cn(
              'relative overflow-hidden rounded-xl border-2 border-foreground/80 bg-background',
              isWide && 'col-span-2',
            )}
          >
            {/* Image */}
            {panel.generation?.url && (
              <img
                src={panel.generation.url}
                alt={panel.generation.prompt}
                className={cn(
                  'w-full object-cover',
                  isWide ? 'max-h-80' : 'aspect-square',
                )}
                loading="lazy"
              />
            )}

            {/* Caption speech bubble */}
            {panel.caption && (
              <div className="absolute left-3 top-3 max-w-[70%]">
                <div className="relative rounded-2xl rounded-bl-sm border border-foreground/20 bg-background/92 px-3 py-2 shadow-md backdrop-blur-sm">
                  <p className="text-xs font-medium leading-snug text-foreground">
                    {panel.caption}
                  </p>
                </div>
              </div>
            )}

            {/* Narration box at bottom */}
            {panel.narration && (
              <div className="border-t-2 border-foreground/80 bg-amber-50/80 px-3 py-2 dark:bg-amber-950/30">
                <p className="font-serif text-xs leading-relaxed text-foreground/80 italic">
                  {panel.narration}
                </p>
              </div>
            )}

            {/* Panel number */}
            <div className="absolute bottom-2 right-2 flex size-5 items-center justify-center rounded-full bg-foreground/70 text-[10px] font-bold text-background">
              {index + 1}
            </div>
          </div>
        )
      })}
    </div>
  )
}
