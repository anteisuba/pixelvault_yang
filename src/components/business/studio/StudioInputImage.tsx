'use client'

import { memo, useCallback, useRef, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { useStableDragState } from '@/hooks/use-stable-drag-state'
import { readImageFileAsBase64 } from '@/lib/image-input'
import { cn } from '@/lib/utils'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_DIMENSION = 2048
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

interface StudioInputImageProps {
  imageData: string | null
  onImageSelect: (base64: string) => void
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

  if (imageData) {
    return (
      <div className={cn('relative group', className)}>
        {/* Data URL preview should bypass next/image optimization and host checks. */}
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
    <div className={cn('space-y-1', className)}>
      <div
        role="button"
        tabIndex={0}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 cursor-pointer transition-colors',
          isDragOver
            ? 'border-primary bg-primary/5'
            : 'border-border/60 hover:border-primary/50 hover:bg-muted/30',
          disabled && 'pointer-events-none opacity-50',
        )}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
        }}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <ImagePlus className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {t('errors.uploadRequired')}
        </p>
      </div>
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
  )
})
