'use client'

import { memo, useCallback, useRef, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_DIMENSION = 2048
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

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
  const [isDragOver, setIsDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const processFile = useCallback(
    (file: File) => {
      setError(null)

      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError(t('errors.inputTooLarge'))
        return
      }

      if (file.size > MAX_FILE_SIZE) {
        setError(t('errors.inputTooLarge'))
        return
      }

      const reader = new FileReader()
      reader.onload = (e) => {
        const result = e.target?.result as string
        if (!result) return

        // Validate dimensions
        const img = new Image()
        img.onload = () => {
          if (img.width > MAX_DIMENSION || img.height > MAX_DIMENSION) {
            setError(t('errors.inputTooLarge'))
            return
          }
          onImageSelect(result)
        }
        img.onerror = () => setError(t('errors.inputTooLarge'))
        img.src = result
      }
      reader.readAsDataURL(file)
    },
    [onImageSelect, t],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) processFile(file)
    },
    [processFile],
  )

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) processFile(file)
      if (inputRef.current) inputRef.current.value = ''
    },
    [processFile],
  )

  if (imageData) {
    return (
      <div className={cn('relative group', className)}>
        <img
          src={imageData}
          alt="Transform input"
          className="w-full rounded-lg object-contain max-h-48 border border-border/40"
        />
        <Button
          variant="destructive"
          size="icon"
          className="absolute top-2 right-2 size-7 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={onImageRemove}
          disabled={disabled}
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
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragOver(true)
        }}
        onDragLeave={() => setIsDragOver(false)}
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
