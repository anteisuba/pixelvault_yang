'use client'

import { useId, useRef, useState, type ReactNode } from 'react'
import { Images, Loader2, UploadCloud } from 'lucide-react'

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
        <div className="space-y-2">
          <button
            type="button"
            aria-describedby={helpId}
            disabled={isDisabled}
            onClick={() => {
              if (!isDisabled) inputRef.current?.click()
            }}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              // 面板内动作不用反相白丸（白只留给"生成"，direction.md 决议 2）——
              // 与下方"选择素材"同为 muted 家族，拖入时才高亮。
              'flex h-11 w-full items-center justify-center gap-2 rounded-full bg-muted/65 px-4 text-sm font-semibold text-foreground shadow-sm transition-colors',
              'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
              'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
              isDragging &&
                'bg-primary text-primary-foreground ring-2 ring-primary/35',
            )}
          >
            {isBusy ? <Loader2 className="size-4 animate-spin" /> : null}
            {!isBusy ? <UploadCloud className="size-4" /> : null}
            <span className="truncate">{uploadLabel}</span>
          </button>
          <button
            type="button"
            disabled={isDisabled}
            onClick={handleOpenAssetDialog}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-muted/65 px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
          >
            <Images className="size-4 shrink-0" />
            <span className="truncate">{selectAssetLabel}</span>
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
