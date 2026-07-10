'use client'
/* eslint-disable @next/next/no-img-element -- recent-asset thumbnails are remote URLs */

import { useEffect, useState, type ReactNode } from 'react'
import { Library, Loader2, UploadCloud } from 'lucide-react'

import { STUDIO_ASSISTANT_RECENT_ASSETS } from '@/constants/studio'
import { Button } from '@/components/ui/button'
import { fetchGalleryImages } from '@/lib/api-client'
import { getImageFileFromDataTransfer } from '@/lib/image-input'
import { cn } from '@/lib/utils'
import type { GenerationRecord } from '@/types'

interface ImagePickerPopoverBodyProps {
  dropHint: string
  recentLabel: string
  recentEmptyLabel: string
  openLibraryLabel: string
  onPickFile: () => void
  onDropFile: (file: File) => void
  onPickAsset: (generation: GenerationRecord) => void
  onOpenLibrary: () => void
  /** Rendered above the dropzone — e.g. a multi-image preview strip. */
  headerSlot?: ReactNode
  /** Rendered below the "open library" row — e.g. a layer-decompose entry. */
  footerSlot?: ReactNode
  className?: string
}

/**
 * ImagePickerPopoverBody — shared image-source popover: drag/paste/click
 * dropzone + recent-assets grid + "open library" fallback. Originally the
 * assistant dock's picker body (2026-07-07 D4); promoted to studio-shared
 * so every image-input chip converges on one UI (docs/plans/assistant-ux-batch-2026-07.md
 * Slice C). All paths only ever call back into the host — this component
 * never triggers generation itself.
 */
export function ImagePickerPopoverBody({
  dropHint,
  recentLabel,
  recentEmptyLabel,
  openLibraryLabel,
  onPickFile,
  onDropFile,
  onPickAsset,
  onOpenLibrary,
  headerSlot,
  footerSlot,
  className,
}: ImagePickerPopoverBodyProps) {
  const [assets, setAssets] = useState<GenerationRecord[] | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  useEffect(() => {
    let cancelled = false
    void fetchGalleryImages(1, STUDIO_ASSISTANT_RECENT_ASSETS, {
      mine: true,
      type: 'image',
      sort: 'newest',
    }).then((result) => {
      if (cancelled) return
      setAssets(result.success ? (result.data?.generations ?? []) : [])
    })
    return () => {
      cancelled = true
    }
  }, [])

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const file = getImageFileFromDataTransfer(event.clipboardData)
    if (!file) return
    event.preventDefault()
    onDropFile(file)
  }

  return (
    <div
      tabIndex={0}
      onPaste={handlePaste}
      className={cn('space-y-3 focus:outline-none', className)}
    >
      {headerSlot}

      <button
        type="button"
        onClick={onPickFile}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes('Files')) return
          event.preventDefault()
          setIsDragOver(true)
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(event) => {
          event.preventDefault()
          setIsDragOver(false)
          const file = getImageFileFromDataTransfer(event.dataTransfer)
          if (file) onDropFile(file)
        }}
        className={cn(
          'flex min-h-16 w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border/70 px-3 py-3 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground',
          isDragOver && 'border-primary/60 bg-primary/10 text-foreground',
        )}
      >
        <UploadCloud className="size-4" />
        {dropHint}
      </button>

      <div className="space-y-1.5">
        <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          {recentLabel}
        </p>
        {assets === null ? (
          <div className="flex h-16 items-center justify-center">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : assets.length === 0 ? (
          <p className="py-3 text-center text-xs text-muted-foreground">
            {recentEmptyLabel}
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-1.5">
            {assets.map((generation) => (
              <button
                key={generation.id}
                type="button"
                onClick={() => onPickAsset(generation)}
                className="group relative aspect-square overflow-hidden rounded-lg border border-border/60 bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <img
                  src={generation.url}
                  alt=""
                  loading="lazy"
                  className="size-full object-cover transition-transform duration-200 group-hover:scale-105"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onOpenLibrary}
        className="h-8 w-full gap-1.5 rounded-lg text-xs"
      >
        <Library className="size-3.5" />
        {openLibraryLabel}
      </Button>

      {footerSlot}
    </div>
  )
}
