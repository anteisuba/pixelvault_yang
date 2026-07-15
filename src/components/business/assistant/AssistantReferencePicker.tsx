'use client'
/* eslint-disable @next/next/no-img-element -- assistant references are user-owned remote media. */

import { useRef, useState, type ChangeEvent } from 'react'
import {
  Check,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Upload,
  Video,
} from 'lucide-react'

import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { ImagePickerPopoverBody } from '@/components/business/studio-shared/ImagePickerPopoverBody'
import { Button } from '@/components/ui/button'
import {
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
} from '@/components/ui/responsive-popover'
import { cn } from '@/lib/utils'
import type { GenerationRecord } from '@/types'

export interface AssistantReferenceOption {
  id: string
  kind: 'image' | 'video'
  label: string
  url: string
  thumbnailUrl?: string
}

interface AssistantReferencePickerLabels {
  trigger: string
  triggerTitle?: string
  title: string
  imageDropHint: string
  recentImages: string
  recentImagesEmpty: string
  openLibrary: string
  libraryTitle: string
  libraryDescription: string
  existingReferences?: string
  uploadVideo?: string
}

interface AssistantReferencePickerProps {
  labels: AssistantReferencePickerLabels
  disabled?: boolean
  hasSelection?: boolean
  existingReferences?: readonly AssistantReferenceOption[]
  selectedReferenceIds?: readonly string[]
  allowVideoUpload?: boolean
  onPickImageFile(file: File): boolean | void | Promise<boolean | void>
  onPickImageAsset(
    generation: GenerationRecord,
  ): boolean | void | Promise<boolean | void>
  onPickVideoFile?(file: File): boolean | void | Promise<boolean | void>
  onPickExisting?(reference: AssistantReferenceOption): void
  triggerClassName?: string
  contentClassName?: string
}

const ACCEPTED_VIDEO_MIME = 'video/mp4,video/quicktime,video/webm'

/**
 * Shared assistant attachment entry. Studio Image and Node Canvas keep their
 * own conversation state and upload semantics, while this component owns the
 * common responsive disclosure, image source browser, file inputs, and media
 * selection affordances.
 */
export function AssistantReferencePicker({
  labels,
  disabled = false,
  hasSelection = false,
  existingReferences = [],
  selectedReferenceIds = [],
  allowVideoUpload = false,
  onPickImageFile,
  onPickImageAsset,
  onPickVideoFile,
  onPickExisting,
  triggerClassName,
  contentClassName,
}: AssistantReferencePickerProps) {
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [assetDialogOpen, setAssetDialogOpen] = useState(false)
  const [isWorking, setIsWorking] = useState(false)

  const runAndClose = async (
    action: () => boolean | void | Promise<boolean | void>,
  ) => {
    setIsWorking(true)
    try {
      const accepted = await action()
      if (accepted !== false) setOpen(false)
    } finally {
      setIsWorking(false)
    }
  }

  const handleFileChange = (
    event: ChangeEvent<HTMLInputElement>,
    kind: 'image' | 'video',
  ) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (kind === 'video' && onPickVideoFile) {
      void runAndClose(() => onPickVideoFile(file))
      return
    }
    void runAndClose(() => onPickImageFile(file))
  }

  const existingSlot =
    existingReferences.length > 0 && onPickExisting ? (
      <div className="space-y-1.5">
        <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          {labels.existingReferences}
        </p>
        <div className="max-h-36 space-y-1 overflow-y-auto pr-1">
          {existingReferences.map((reference) => {
            const selected = selectedReferenceIds.includes(reference.id)
            const Icon = reference.kind === 'video' ? Video : ImageIcon
            return (
              <button
                key={reference.id}
                type="button"
                disabled={selected || isWorking}
                onClick={() => {
                  onPickExisting(reference)
                  setOpen(false)
                }}
                className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:cursor-default disabled:opacity-60"
              >
                {reference.thumbnailUrl ? (
                  <img
                    src={reference.thumbnailUrl}
                    alt=""
                    className="size-8 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                    <Icon className="size-4" />
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate">
                  {reference.label}
                </span>
                {selected ? <Check className="size-3.5" /> : null}
              </button>
            )
          })}
        </div>
      </div>
    ) : undefined

  const videoSlot =
    allowVideoUpload && onPickVideoFile && labels.uploadVideo ? (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isWorking}
        onClick={() => videoInputRef.current?.click()}
        className="h-9 w-full gap-1.5 rounded-lg text-xs"
      >
        {isWorking ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Upload className="size-3.5" />
        )}
        <Video className="size-3.5" />
        {labels.uploadVideo}
      </Button>
    ) : undefined

  return (
    <>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        disabled={disabled || isWorking}
        onChange={(event) => handleFileChange(event, 'image')}
      />
      {allowVideoUpload ? (
        <input
          ref={videoInputRef}
          type="file"
          accept={ACCEPTED_VIDEO_MIME}
          className="hidden"
          disabled={disabled || isWorking}
          onChange={(event) => handleFileChange(event, 'video')}
        />
      ) : null}

      <ResponsivePopover open={open} onOpenChange={setOpen}>
        <ResponsivePopoverTrigger asChild>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            disabled={disabled || isWorking}
            aria-label={labels.trigger}
            title={labels.triggerTitle ?? labels.trigger}
            className={cn(
              'rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground',
              hasSelection && 'bg-primary/10 text-primary',
              triggerClassName,
            )}
          >
            {isWorking ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Paperclip className="size-4" />
            )}
          </Button>
        </ResponsivePopoverTrigger>
        <ResponsivePopoverContent
          label={labels.title}
          align="start"
          sideOffset={8}
          className={cn('w-72 p-3', contentClassName)}
        >
          <ImagePickerPopoverBody
            dropHint={labels.imageDropHint}
            recentLabel={labels.recentImages}
            recentEmptyLabel={labels.recentImagesEmpty}
            openLibraryLabel={labels.openLibrary}
            onPickFile={() => imageInputRef.current?.click()}
            onDropFile={(file) => {
              void runAndClose(() => onPickImageFile(file))
            }}
            onPickAsset={(generation) => {
              void runAndClose(() => onPickImageAsset(generation))
            }}
            onOpenLibrary={() => {
              setOpen(false)
              setAssetDialogOpen(true)
            }}
            headerSlot={existingSlot}
            footerSlot={videoSlot}
          />
        </ResponsivePopoverContent>
      </ResponsivePopover>

      <AssetSelectorDialog
        open={assetDialogOpen}
        onOpenChange={setAssetDialogOpen}
        onSelect={(generation) => {
          void runAndClose(() => onPickImageAsset(generation))
          setAssetDialogOpen(false)
        }}
        title={labels.libraryTitle}
        description={labels.libraryDescription}
        mediaType="image"
      />
    </>
  )
}
