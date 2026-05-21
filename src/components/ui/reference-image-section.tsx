'use client'

import { Plus, X } from 'lucide-react'

import { ImageDropZone } from '@/components/ui/image-drop-zone'
import type { ReferenceImageEntry } from '@/hooks/use-image-upload'
import { cn } from '@/lib/utils'

interface ReferenceImageSectionProps {
  /**
   * Full reference-image state including entries the active model can't use.
   * Disabled entries are kept in place so a model switch back restores them.
   */
  entries: ReadonlyArray<ReferenceImageEntry>
  /** Maximum number of images allowed (from provider capabilities) */
  maxImages: number
  isDragging: boolean
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onOpenFilePicker: () => void
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onRemoveImage: (index: number) => void
  onClearAll: () => void
  previewAlt: string
  removeLabel: string
  uploadLabel: string
  formatsLabel: string
  inputAriaLabel?: string
  /** i18n: "{current} / {max}" counter text */
  counterLabel?: string
  /** Tooltip on a thumbnail whose entry is over the active model's max */
  overLimitTooltip?: string
  /** Tooltip on a thumbnail when the active model accepts no reference images */
  unsupportedTooltip?: string
}

export function ReferenceImageSection({
  entries,
  maxImages,
  isDragging,
  fileInputRef,
  onDrop,
  onDragOver,
  onDragLeave,
  onOpenFilePicker,
  onInputChange,
  onRemoveImage,
  onClearAll,
  previewAlt,
  removeLabel,
  uploadLabel,
  formatsLabel,
  inputAriaLabel,
  counterLabel,
  overLimitTooltip,
  unsupportedTooltip,
}: ReferenceImageSectionProps) {
  const hasImages = entries.length > 0
  const enabledCount = entries.reduce(
    (n, e) => (e.disabledReason === null ? n + 1 : n),
    0,
  )
  const canAddMore = maxImages > 0 && enabledCount < maxImages

  return (
    <>
      {hasImages ? (
        <div className="space-y-3">
          {/* Thumbnail grid */}
          <div className="flex flex-wrap gap-2.5">
            {entries.map((entry, index) => {
              const disabled = entry.disabledReason !== null
              const tooltip =
                entry.disabledReason === 'over_limit'
                  ? overLimitTooltip
                  : entry.disabledReason === 'unsupported'
                    ? unsupportedTooltip
                    : undefined
              return (
                <div
                  key={index}
                  title={tooltip}
                  className={cn(
                    'group relative overflow-hidden rounded-xl border border-border/75 bg-background transition-opacity',
                    disabled && 'opacity-50',
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={entry.url}
                    alt={`${previewAlt} ${index + 1}`}
                    className={cn(
                      'h-24 w-auto object-cover sm:h-28',
                      disabled && 'grayscale',
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveImage(index)}
                    className="absolute right-1.5 top-1.5 rounded-full border border-border/75 bg-background/92 p-1 text-muted-foreground opacity-0 transition-all hover:text-destructive group-hover:opacity-100"
                    aria-label={removeLabel}
                  >
                    <X className="size-3" />
                  </button>
                </div>
              )
            })}

            {/* Add more button — only when the active model still has room */}
            {canAddMore && (
              <button
                type="button"
                onClick={onOpenFilePicker}
                className={cn(
                  'flex h-24 w-20 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed transition-colors sm:h-28 sm:w-24',
                  'border-border/60 bg-background/60 text-muted-foreground hover:border-primary/30 hover:bg-primary/3 hover:text-foreground',
                )}
              >
                <Plus className="size-5" />
                <span className="text-2xs font-medium">
                  {enabledCount}/{maxImages}
                </span>
              </button>
            )}
          </div>

          {/* Counter + clear all */}
          <div className="flex items-center justify-between">
            {counterLabel && (
              <p className="text-xs text-muted-foreground">{counterLabel}</p>
            )}
            {entries.length > 1 && (
              <button
                type="button"
                onClick={onClearAll}
                className="text-xs text-muted-foreground transition-colors hover:text-destructive"
              >
                {removeLabel}
              </button>
            )}
          </div>
        </div>
      ) : (
        <ImageDropZone
          isDragging={isDragging}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={onOpenFilePicker}
          uploadLabel={uploadLabel}
          formatsLabel={
            maxImages > 1 ? `${formatsLabel} (max ${maxImages})` : formatsLabel
          }
        />
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple={maxImages > 1}
        aria-label={inputAriaLabel}
        className="hidden"
        onChange={onInputChange}
      />
    </>
  )
}
