'use client'

import { useId, useRef, useState, type ReactNode } from 'react'
import { Images, Loader2, UploadCloud } from 'lucide-react'

import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { useStableDragState } from '@/hooks/use-stable-drag-state'
import { getImageFileFromDataTransfer } from '@/lib/image-input'
import { cn } from '@/lib/utils'
import type { GenerationRecord } from '@/types'

type ImageSourcePickerVariant = 'pill' | 'card'

interface ImageSourcePickerProps {
  description: string
  uploadLabel: string
  uploadHint: string
  selectAssetLabel: string
  assetDialogTitle: string
  assetDialogDescription: string
  pasteHint?: string
  disabled?: boolean
  preview?: ReactNode
  className?: string
  variant?: ImageSourcePickerVariant
  onFileSelect: (file: File) => void | Promise<void>
  onAssetSelect: (generation: GenerationRecord) => void | Promise<void>
  onRequestClose?: () => void
  onRequestAssetDialog?: () => void
}

export function ImageSourcePicker({
  description,
  uploadLabel,
  uploadHint,
  selectAssetLabel,
  assetDialogTitle,
  assetDialogDescription,
  pasteHint,
  disabled = false,
  preview,
  className,
  variant = 'pill',
  onFileSelect,
  onAssetSelect,
  onRequestClose,
  onRequestAssetDialog,
}: ImageSourcePickerProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const helpId = useId()
  const {
    isDragging,
    resetDragging,
    handleDragEnter: markDragEnter,
    handleDragOver: markDragOver,
    handleDragLeave: markDragLeave,
  } = useStableDragState()
  const inputRef = useRef<HTMLInputElement>(null)
  const isDisabled = disabled || isBusy
  const isCard = variant === 'card'

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return
    setIsBusy(true)
    try {
      await onFileSelect(file)
      onRequestClose?.()
    } finally {
      setIsBusy(false)
    }
  }

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) void handleFile(file)
  }

  const hasFilePayload = (dataTransfer: DataTransfer) =>
    Array.from(dataTransfer.types).includes('Files')

  const handleDragEnter = (event: React.DragEvent<HTMLButtonElement>) => {
    if (isDisabled || !hasFilePayload(event.dataTransfer)) return
    event.stopPropagation()
    markDragEnter(event)
  }

  const handleDragOver = (event: React.DragEvent<HTMLButtonElement>) => {
    if (isDisabled || !hasFilePayload(event.dataTransfer)) return
    event.stopPropagation()
    markDragOver(event)
  }

  const handleDragLeave = (event: React.DragEvent<HTMLButtonElement>) => {
    if (isDisabled) return
    event.stopPropagation()
    markDragLeave(event)
  }

  const handleDrop = (event: React.DragEvent<HTMLButtonElement>) => {
    if (isDisabled || !hasFilePayload(event.dataTransfer)) return
    event.preventDefault()
    event.stopPropagation()
    resetDragging()
    const file = getImageFileFromDataTransfer(event.dataTransfer)
    if (file) void handleFile(file)
  }

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const file = getImageFileFromDataTransfer(event.clipboardData)
    if (!file) return
    event.preventDefault()
    void handleFile(file)
  }

  const handleOpenAssetDialog = () => {
    if (isDisabled) return
    if (onRequestAssetDialog) {
      onRequestAssetDialog()
      return
    }
    setDialogOpen(true)
  }

  const handleAssetSelect = async (generation: GenerationRecord) => {
    if (generation.outputType !== 'IMAGE') return
    await onAssetSelect(generation)
    onRequestClose?.()
  }

  const helpText = [description, uploadHint, pasteHint]
    .filter(Boolean)
    .join(' ')
  const uploadIcon = isBusy ? (
    <Loader2 className={cn(isCard ? 'size-5' : 'size-4', 'animate-spin')} />
  ) : (
    <UploadCloud className={isCard ? 'size-5' : 'size-4'} />
  )
  // Layered source card: faint raised tile (vs the darker popover) whose icon
  // well + label brighten together on hover, so the card reads as a tactile
  // surface rather than a flat bordered box.
  const cardButtonClass =
    'group/card relative flex min-h-28 flex-1 flex-col items-center justify-center gap-2.5 rounded-xl border border-border/50 bg-muted/30 px-3 py-4 text-center text-xs font-medium leading-tight text-foreground transition-colors duration-base ease-standard hover:border-border hover:bg-muted/55 active:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50'
  const cardWellClass =
    'flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground ring-1 ring-inset ring-border/40 transition-colors duration-base ease-standard group-hover/card:bg-muted group-hover/card:text-foreground group-hover/card:ring-border'

  return (
    <>
      <div
        tabIndex={0}
        onPaste={handlePaste}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          inputRef.current?.click()
        }}
        className={cn(
          'space-y-2 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
          className,
        )}
      >
        {preview ? <div className="pb-0.5">{preview}</div> : null}
        <p id={helpId} className="sr-only">
          {helpText}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleInputChange}
          className="hidden"
          disabled={isDisabled}
        />
        <div
          className={cn(isCard ? 'flex items-stretch gap-2.5' : 'space-y-2')}
        >
          <button
            type="button"
            aria-describedby={helpId}
            title={uploadHint}
            disabled={isDisabled}
            onClick={() => {
              if (!isDisabled) inputRef.current?.click()
            }}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              isCard
                ? cardButtonClass
                : 'flex h-11 w-full items-center justify-center gap-2 rounded-full bg-muted/65 px-4 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
              isDragging &&
                'border-primary/40 bg-primary/10 ring-2 ring-primary/40 hover:bg-primary/10',
            )}
          >
            {isCard ? (
              <span
                className={cn(
                  cardWellClass,
                  isDragging &&
                    'bg-primary/15 text-primary ring-primary/30 group-hover/card:bg-primary/15 group-hover/card:text-primary group-hover/card:ring-primary/30',
                )}
              >
                {uploadIcon}
              </span>
            ) : (
              uploadIcon
            )}
            <span
              className={cn(
                isCard ? 'max-w-full text-balance' : 'truncate text-left',
              )}
            >
              {uploadLabel}
            </span>
          </button>
          <button
            type="button"
            title={selectAssetLabel}
            disabled={isDisabled}
            onClick={handleOpenAssetDialog}
            className={
              isCard
                ? cardButtonClass
                : 'flex h-10 w-full items-center justify-center gap-2 rounded-full bg-muted/65 px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50'
            }
          >
            {isCard ? (
              <span className={cardWellClass}>
                <Images className="size-5 shrink-0" />
              </span>
            ) : (
              <Images className="size-4 shrink-0" />
            )}
            <span
              className={cn(
                isCard ? 'max-w-full text-balance' : 'truncate text-left',
              )}
            >
              {selectAssetLabel}
            </span>
          </button>
        </div>
      </div>
      <AssetSelectorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSelect={handleAssetSelect}
        title={assetDialogTitle}
        description={assetDialogDescription}
        mediaType="image"
      />
    </>
  )
}
