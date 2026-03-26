'use client'

import { X } from 'lucide-react'

import { ImageDropZone } from '@/components/ui/image-drop-zone'

interface ReferenceImageSectionProps {
  referenceImage: string | undefined
  isDragging: boolean
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onOpenFilePicker: () => void
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onClear: () => void
  previewAlt: string
  removeLabel: string
  uploadLabel: string
  formatsLabel: string
  inputAriaLabel?: string
}

export function ReferenceImageSection({
  referenceImage,
  isDragging,
  fileInputRef,
  onDrop,
  onDragOver,
  onDragLeave,
  onOpenFilePicker,
  onInputChange,
  onClear,
  previewAlt,
  removeLabel,
  uploadLabel,
  formatsLabel,
  inputAriaLabel,
}: ReferenceImageSectionProps) {
  return (
    <>
      {referenceImage ? (
        <div className="relative inline-flex overflow-hidden rounded-2xl border border-border/75 bg-background">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={referenceImage}
            alt={previewAlt}
            className="h-36 w-auto object-cover"
          />
          <button
            type="button"
            onClick={onClear}
            className="absolute right-3 top-3 rounded-full border border-border/75 bg-background/92 p-1.5 text-muted-foreground transition-colors hover:text-destructive"
            aria-label={removeLabel}
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <ImageDropZone
          isDragging={isDragging}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={onOpenFilePicker}
          uploadLabel={uploadLabel}
          formatsLabel={formatsLabel}
        />
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        aria-label={inputAriaLabel}
        className="hidden"
        onChange={onInputChange}
      />
    </>
  )
}
