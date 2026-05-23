'use client'

import { memo, useCallback, useRef, useState } from 'react'
import { ImagePlus, Images, UploadCloud, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { Button } from '@/components/ui/button'
import { useStableDragState } from '@/hooks/use-stable-drag-state'
import { readImageFileAsBase64 } from '@/lib/image-input'
import { cn } from '@/lib/utils'
import type { GenerationRecord } from '@/types'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_DIMENSION = 2048
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

interface StudioInputImageProps {
  imageData: string | null
  onImageSelect: (imageData: string) => void
  onImageRemove: () => void
  disabled?: boolean
  className?: string
}

export const StudioInputImage = memo(function StudioInputImage({
  imageData,
  onImageSelect,
  onImageRemove,
  disabled,
  className,
}: StudioInputImageProps) {
  const t = useTranslations('Transform')
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [assetDialogOpen, setAssetDialogOpen] = useState(false)
  const {
    isDragging: isDragOver,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    resetDragging,
  } = useStableDragState()

  const processFile = useCallback(
    async (file: File) => {
      setError(null)
      const result = await readImageFileAsBase64(file, {
        acceptedTypes: ACCEPTED_TYPES,
        maxFileSize: MAX_FILE_SIZE,
        maxDimension: MAX_DIMENSION,
      })
      if (!result.ok) {
        // All failure modes share one message here — the user just needs to
        // know the file isn't usable. Callers that want distinct strings per
        // reason can switch on result.reason instead.
        setError(t('errors.inputTooLarge'))
        return
      }
      onImageSelect(result.base64)
    },
    [onImageSelect, t],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      resetDragging()
      const file = e.dataTransfer.files[0]
      if (file) void processFile(file)
    },
    [processFile, resetDragging],
  )

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) void processFile(file)
      if (inputRef.current) inputRef.current.value = ''
    },
    [processFile],
  )

  const handleAssetSelect = useCallback(
    (generation: GenerationRecord) => {
      if (generation.outputType !== 'IMAGE') return
      setError(null)
      onImageSelect(generation.url)
    },
    [onImageSelect],
  )

  if (imageData) {
    return (
      <div className={cn('relative group', className)}>
        {/* Transform input may be a data URL or a stored asset URL. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageData}
          alt={t('inputPreviewAlt')}
          className="w-full rounded-lg object-contain max-h-48 border border-border/40"
        />
        <Button
          variant="destructive"
          size="icon"
          className="absolute top-2 right-2 size-7 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={onImageRemove}
          disabled={disabled}
          aria-label={t('removeInputImage')}
        >
          <X className="size-4" />
        </Button>
      </div>
    )
  }

  return (
    <>
      <div
        className={cn(
          'rounded-xl border border-border/60 bg-card/70 p-3 shadow-sm',
          className,
        )}
      >
        <div className="mb-3 flex items-start gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <ImagePlus className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              {t('chooseInputImage')}
            </p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              {t('errors.uploadRequired')}
            </p>
          </div>
        </div>
        <button
          type="button"
          className={cn(
            'flex h-11 w-full items-center justify-center gap-2 rounded-full bg-foreground px-4 text-sm font-semibold text-background shadow-sm transition-colors',
            'hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
            isDragOver &&
              'bg-primary text-primary-foreground ring-2 ring-primary/35',
          )}
          onClick={() => inputRef.current?.click()}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          disabled={disabled}
        >
          <UploadCloud className="size-4" />
          {t('uploadImage')}
        </button>
        <Button
          type="button"
          variant="secondary"
          className="mt-2 h-10 w-full rounded-full gap-2"
          onClick={() => setAssetDialogOpen(true)}
          disabled={disabled}
        >
          <Images className="size-4" />
          {t('selectAsset')}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          className="hidden"
          onChange={handleFileChange}
          disabled={disabled}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <AssetSelectorDialog
        open={assetDialogOpen}
        onOpenChange={setAssetDialogOpen}
        onSelect={handleAssetSelect}
        title={t('selectAsset')}
        description={t('selectAssetDescription')}
        mediaType="image"
      />
    </>
  )
})
