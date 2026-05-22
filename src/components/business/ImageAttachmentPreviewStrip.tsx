'use client'

import { Image as ImageIcon, X } from 'lucide-react'

import type { ReferenceImageEntry } from '@/hooks/use-image-upload'
import { cn } from '@/lib/utils'

interface ImageAttachmentPreviewStripProps {
  entries: ReadonlyArray<ReferenceImageEntry>
  previewAlt: string
  removeLabel: (index: number) => string
  onRemove: (index: number) => void
  overLimitTooltip?: string
  unsupportedTooltip?: string
  variant?: 'composer' | 'panel'
}

export function ImageAttachmentPreviewStrip({
  entries,
  previewAlt,
  removeLabel,
  onRemove,
  overLimitTooltip,
  unsupportedTooltip,
  variant = 'panel',
}: ImageAttachmentPreviewStripProps) {
  if (entries.length === 0) return null

  return (
    <div
      className={cn(
        'flex gap-2 overflow-x-auto overscroll-contain',
        variant === 'composer'
          ? 'px-2 pb-1 pt-2'
          : 'rounded-xl border border-border/55 bg-background/45 p-2',
      )}
    >
      {entries.map((entry, index) => {
        const isDisabled = entry.disabledReason !== null
        const tooltip =
          entry.disabledReason === 'over_limit'
            ? overLimitTooltip
            : entry.disabledReason === 'unsupported'
              ? unsupportedTooltip
              : undefined

        return (
          <div
            key={`${index}-${entry.url.slice(0, 32)}`}
            title={tooltip}
            className={cn(
              'group relative flex size-16 shrink-0 overflow-hidden rounded-xl border border-border/65 bg-muted/35 shadow-sm',
              variant === 'composer' && 'size-14 rounded-lg',
              isDisabled && 'opacity-55',
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={entry.url}
              alt={`${previewAlt} ${index + 1}`}
              className={cn(
                'size-full object-cover transition-transform duration-200 group-hover:scale-105',
                isDisabled && 'grayscale',
              )}
            />
            {isDisabled ? (
              <span className="absolute inset-0 flex items-center justify-center bg-background/35 text-muted-foreground">
                <ImageIcon className="size-4" />
              </span>
            ) : null}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onRemove(index)
              }}
              aria-label={removeLabel(index + 1)}
              className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-background/92 text-foreground opacity-0 shadow-sm transition-opacity hover:bg-background group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <X className="size-3" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
