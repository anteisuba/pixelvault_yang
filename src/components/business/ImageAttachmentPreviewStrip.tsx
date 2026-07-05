'use client'

import { useRef, useState } from 'react'
import { Image as ImageIcon, X } from 'lucide-react'

import type { ReferenceImageEntry } from '@/hooks/use-image-upload'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'

interface ImageAttachmentPreviewStripProps {
  entries: ReadonlyArray<ReferenceImageEntry>
  previewAlt: string
  previewLabel?: (index: number) => string
  previewDescription?: string
  previewCloseLabel?: string
  removeLabel: (index: number) => string
  onRemove: (index: number) => void
  overLimitTooltip?: string
  unsupportedTooltip?: string
  variant?: 'composer' | 'panel'
}

export function ImageAttachmentPreviewStrip({
  entries,
  previewAlt,
  previewLabel,
  previewDescription,
  previewCloseLabel,
  removeLabel,
  onRemove,
  overLimitTooltip,
  unsupportedTooltip,
  variant = 'panel',
}: ImageAttachmentPreviewStripProps) {
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const previewTriggerRef = useRef<HTMLButtonElement | null>(null)

  if (entries.length === 0) return null

  const previewEntry =
    previewIndex === null ? null : (entries[previewIndex] ?? null)
  const isPreviewEnabled =
    previewLabel !== undefined &&
    previewDescription !== undefined &&
    previewCloseLabel !== undefined

  return (
    <>
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
          const imageAlt = `${previewAlt} ${index + 1}`
          const imagePreviewLabel = previewLabel?.(index + 1)

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
              {isPreviewEnabled && imagePreviewLabel ? (
                <button
                  type="button"
                  aria-label={imagePreviewLabel}
                  onClick={(event) => {
                    event.stopPropagation()
                    previewTriggerRef.current = event.currentTarget
                    setPreviewIndex(index)
                  }}
                  className="size-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={entry.url}
                    alt=""
                    className={cn(
                      'size-full object-cover transition-transform duration-200 group-hover:scale-105',
                      isDisabled && 'grayscale',
                    )}
                  />
                </button>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={entry.url}
                  alt={imageAlt}
                  className={cn(
                    'size-full object-cover transition-transform duration-200 group-hover:scale-105',
                    isDisabled && 'grayscale',
                  )}
                />
              )}
              {isDisabled ? (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/35 text-muted-foreground">
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
                className={cn(
                  'absolute right-1 top-1 z-10 flex size-5 items-center justify-center rounded-full opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                  variant === 'composer'
                    ? 'border border-black/10 bg-white/90 text-neutral-800 hover:bg-white'
                    : 'bg-background/92 text-foreground hover:bg-background',
                )}
              >
                <X className="size-3" />
              </button>
            </div>
          )
        })}
      </div>

      {isPreviewEnabled ? (
        <Dialog
          open={previewEntry !== null}
          onOpenChange={(open) => {
            if (!open) setPreviewIndex(null)
          }}
        >
          <DialogContent
            closeLabel={previewCloseLabel}
            className="w-auto max-w-5xl gap-0 rounded-2xl border-border/60 bg-background/95 p-3 shadow-2xl backdrop-blur-md sm:max-w-5xl"
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              window.setTimeout(() => previewTriggerRef.current?.focus(), 0)
            }}
          >
            <DialogTitle className="sr-only">
              {previewIndex === null ? '' : previewLabel?.(previewIndex + 1)}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {previewDescription}
            </DialogDescription>
            {previewEntry && previewIndex !== null ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewEntry.url}
                alt={previewLabel?.(previewIndex + 1)}
                className="max-w-full rounded-xl object-contain"
                style={{ maxHeight: '80dvh' }}
              />
            ) : null}
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  )
}
