'use client'

import { useRef, useState, type ReactNode } from 'react'
import {
  Clipboard,
  ImagePlus,
  Images,
  Loader2,
  UploadCloud,
} from 'lucide-react'

import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { useStableDragState } from '@/hooks/use-stable-drag-state'
import { getImageFileFromDataTransfer } from '@/lib/image-input'
import { cn } from '@/lib/utils'
import type { GenerationRecord } from '@/types'

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
  onFileSelect: (file: File) => void | Promise<void>
  onAssetSelect: (generation: GenerationRecord) => void | Promise<void>
  onRequestClose?: () => void
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
  onFileSelect,
  onAssetSelect,
  onRequestClose,
}: ImageSourcePickerProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const {
    isDragging,
    resetDragging,
    handleDragEnter: markDragEnter,
    handleDragOver: markDragOver,
    handleDragLeave: markDragLeave,
  } = useStableDragState()
  const inputRef = useRef<HTMLInputElement>(null)
  const isDisabled = disabled || isBusy

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
    setDialogOpen(true)
  }

  const handleAssetSelect = async (generation: GenerationRecord) => {
    if (generation.outputType !== 'IMAGE') return
    await onAssetSelect(generation)
    onRequestClose?.()
  }

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
          'space-y-3 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
          className,
        )}
      >
        {preview}
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted/65 text-muted-foreground">
            <ImagePlus className="size-4" />
          </span>
          <p className="pt-0.5 text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleInputChange}
          className="hidden"
          disabled={isDisabled}
        />
        <div className="overflow-hidden rounded-2xl border border-border/65 bg-background/45 p-1.5 shadow-sm">
          <button
            type="button"
            disabled={isDisabled}
            onClick={() => {
              if (!isDisabled) inputRef.current?.click()
            }}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              'flex min-h-20 w-full items-center gap-3 rounded-xl border border-dashed border-border/55 bg-muted/20 px-3 py-3 text-left transition-colors',
              'hover:border-foreground/30 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
              'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
              isDragging && 'border-primary/60 bg-primary/10 text-primary',
            )}
          >
            <span
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-full bg-background text-muted-foreground ring-1 ring-border/55 transition-colors',
                isDragging && 'text-primary ring-primary/35',
              )}
            >
              {isBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <UploadCloud className="size-5" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-foreground">
                {uploadLabel}
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {uploadHint}
              </span>
            </span>
            {pasteHint ? (
              <span className="hidden shrink-0 items-center gap-1 rounded-full border border-border/55 bg-background/70 px-2 py-1 text-2xs text-muted-foreground sm:inline-flex">
                <Clipboard className="size-3" />
                {pasteHint}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            disabled={isDisabled}
            onClick={handleOpenAssetDialog}
            className="mt-1.5 flex min-h-11 w-full items-center justify-between gap-4 rounded-xl bg-card/65 px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
          >
            <span className="inline-flex min-w-0 items-center gap-2">
              <Images className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{selectAssetLabel}</span>
            </span>
            <Images className="size-4 shrink-0 text-muted-foreground" />
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
