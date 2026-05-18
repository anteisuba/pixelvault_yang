'use client'

import { useRef, useState } from 'react'
import { FolderOpen, Image as ImageIcon, Plus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import * as Toolbar from '@radix-ui/react-toolbar'

import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useStudioData } from '@/contexts/studio-context'
import { cn } from '@/lib/utils'
import type { GenerationRecord } from '@/types'

interface ReferenceImageChipProps {
  disabled?: boolean
}

/**
 * ReferenceImageChip — Krea-style "Image" chip combining Upload + Select asset
 * into a single compose-bar entry point.
 *
 *   tap chip       → popover with Upload primary + Select asset secondary
 *   tap Upload     → native file picker, base64 → addReferenceImage
 *   tap Select     → close popover, open full-screen AssetSelectorDialog
 *                     (Krea-style sidebar + grid). Picking a tile fetches
 *                     the asset via addFromUrl and dismisses the dialog.
 *
 * Both paths feed the same useImageUpload store, so downstream generation
 * code is unchanged. Uploads use a chip-local hidden file input rather
 * than useImageUpload's shared fileInputRef so the legacy "参照画像"
 * panel can keep mounting its own input without ref collisions.
 */
export function ReferenceImageChip({ disabled }: ReferenceImageChipProps) {
  const t = useTranslations('ImageChip')
  const { imageUpload } = useStudioData()
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const referenceCount = imageUpload.referenceImages.length
  const isActive = referenceCount > 0

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = '' // allow picking the same file twice in a row
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      imageUpload.addReferenceImage(reader.result as string)
      setPopoverOpen(false)
    }
    reader.readAsDataURL(file)
  }

  const handleSelectAsset = async (gen: GenerationRecord) => {
    // Defensive guard: even though AssetSelectorDialog is locked to
    // mediaType="image", a future caller wiring this chip up differently
    // could pass through a video/audio asset and addFromUrl would silently
    // attach it as a "reference image", breaking downstream generation.
    if (gen.outputType !== 'IMAGE') return
    await imageUpload.addFromUrl(gen.url)
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Toolbar.Button
            type="button"
            disabled={disabled}
            aria-label={t('label')}
            className={cn(
              'relative inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground transition-all duration-200',
              'hover:bg-muted/30 hover:text-foreground hover:scale-[1.03] active:scale-[0.95]',
              'focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none',
              isActive && 'bg-muted/30 text-primary',
            )}
          >
            <ImageIcon className="size-4 shrink-0" />
            <span className="hidden sm:inline">{t('label')}</span>
            {referenceCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-white">
                {referenceCount}
              </span>
            )}
          </Toolbar.Button>
        </PopoverTrigger>

        <PopoverContent
          className="w-[28rem] max-w-[calc(100vw-2rem)] p-3"
          side="top"
          align="center"
          sideOffset={12}
        >
          <div className="space-y-3">
            {/*
             * Selected-reference preview row — Krea shows the picked asset
             * above the action CTAs. Each thumbnail carries its own × so a
             * user can drop one reference without clearing the rest.
             */}
            {referenceCount > 0 && (
              <div className="flex flex-wrap gap-2">
                {imageUpload.referenceImages.map((src, idx) => (
                  <div
                    key={`${idx}-${src.slice(0, 24)}`}
                    className="group relative size-16 overflow-hidden rounded-lg border border-border/60 bg-muted/40"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="size-full object-cover" />
                    <button
                      type="button"
                      onClick={() => imageUpload.removeReferenceImage(idx)}
                      aria-label={t('removeReferenceImage', {
                        index: idx + 1,
                      })}
                      className="absolute right-0.5 top-0.5 flex size-5 items-center justify-center rounded-full bg-background/90 text-foreground opacity-0 shadow transition-opacity group-hover:opacity-100"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t('description')}
            </p>
            <button
              type="button"
              onClick={handleUploadClick}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
            >
              <Plus className="size-4" />
              {t('upload')}
            </button>
            <button
              type="button"
              onClick={() => {
                // Close the small popover before opening the full-screen
                // dialog so they don't stack with conflicting focus traps.
                setPopoverOpen(false)
                setDialogOpen(true)
              }}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-border/60 bg-card/70 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-card"
            >
              <FolderOpen className="size-4" />
              {t('selectAsset')}
            </button>
          </div>
        </PopoverContent>
      </Popover>
      <AssetSelectorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSelect={handleSelectAsset}
        title={t('selectAsset')}
        description={t('description')}
        mediaType="image"
      />
    </>
  )
}
