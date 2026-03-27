'use client'

import { Plus, X } from 'lucide-react'

import { ImageDropZone } from '@/components/ui/image-drop-zone'
import { cn } from '@/lib/utils'

interface ReferenceImageSectionProps {
  /** All reference images (multi-image mode) */
  referenceImages: string[]
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
}

export function ReferenceImageSection({
  referenceImages,
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
}: ReferenceImageSectionProps) {
  const hasImages = referenceImages.length > 0
  const canAddMore = referenceImages.length < maxImages

  return (
    <>
      {hasImages ? (
        <div className="space-y-3">
          {/* Thumbnail grid */}
          <div className="flex flex-wrap gap-2.5">
            {referenceImages.map((img, index) => (
              <div
                key={index}
                className="group relative overflow-hidden rounded-xl border border-border/75 bg-background"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img}
                  alt={`${previewAlt} ${index + 1}`}
                  className="h-24 w-auto object-cover sm:h-28"
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
            ))}

            {/* Add more button (inline) */}
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
                  {referenceImages.length}/{maxImages}
                </span>
              </button>
            )}
          </div>

          {/* Counter + clear all */}
          <div className="flex items-center justify-between">
            {counterLabel && (
              <p className="text-xs text-muted-foreground">{counterLabel}</p>
            )}
            {referenceImages.length > 1 && (
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
