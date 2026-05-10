'use client'

import { useRef, useState } from 'react'
import {
  ArrowLeft,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Plus,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import * as Toolbar from '@radix-ui/react-toolbar'

import { AssetBrowser } from '@/components/business/AssetBrowser'
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

type View = 'menu' | 'browse'

/**
 * ReferenceImageChip — Krea-style "Image" chip combining Upload + Select asset
 * into a single compose-bar entry point.
 *
 * View flow (mirrors Krea's popover):
 *   menu   → description + Upload (primary) + Select asset (secondary)
 *   browse → ← Back + AssetBrowser thumbnail grid
 *
 * Routing: both Upload and Select asset feed the same useImageUpload store
 * via addReferenceImage / addFromUrl, so downstream generation code
 * doesn't care which path the user took.
 *
 * Uploads use a chip-local hidden file input (instead of useImageUpload's
 * shared fileInputRef) so the legacy "参照画像" panel can keep mounting
 * its own input without ref collisions during the migration window.
 */
export function ReferenceImageChip({ disabled }: ReferenceImageChipProps) {
  const t = useTranslations('ImageChip')
  const { imageUpload } = useStudioData()
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<View>('menu')
  const [isAddingFromUrl, setIsAddingFromUrl] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const referenceCount = imageUpload.referenceImages.length
  const isActive = referenceCount > 0

  const resetAndClose = () => {
    setOpen(false)
    setView('menu')
  }

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
      resetAndClose()
    }
    reader.readAsDataURL(file)
  }

  const handleSelectAsset = async (gen: GenerationRecord) => {
    if (isAddingFromUrl) return
    setIsAddingFromUrl(true)
    try {
      await imageUpload.addFromUrl(gen.url)
      resetAndClose()
    } finally {
      setIsAddingFromUrl(false)
    }
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
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setView('menu')
        }}
      >
        <PopoverTrigger asChild>
          <Toolbar.Button
            type="button"
            disabled={disabled}
            aria-label={t('label')}
            className={cn(
              'relative inline-flex h-10 sm:h-8 items-center gap-1.5 rounded-lg px-3 sm:px-2.5 text-xs text-muted-foreground transition-all duration-200',
              'hover:bg-muted/30 hover:text-foreground hover:scale-[1.03] active:scale-[0.95]',
              'focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none',
              isActive && 'bg-muted/30 text-primary',
            )}
          >
            <ImageIcon className="size-3.5 shrink-0" />
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
          align="start"
          sideOffset={6}
        >
          {view === 'menu' ? (
            <div className="space-y-3">
              {/*
               * Selected-reference preview row — shows a thumbnail per
               * already-attached reference image (Krea screenshot 1
               * shows a single picked asset above the Upload / Select
               * asset CTAs). Each chip carries its own × button so
               * users can remove an individual reference without
               * clearing the whole set.
               */}
              {referenceCount > 0 && (
                <div className="flex flex-wrap gap-2">
                  {imageUpload.referenceImages.map((src, idx) => (
                    <div
                      key={`${idx}-${src.slice(0, 24)}`}
                      className="group relative size-16 overflow-hidden rounded-lg border border-border/60 bg-muted/40"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt=""
                        className="size-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => imageUpload.removeReferenceImage(idx)}
                        aria-label={t('back')}
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
                onClick={() => setView('browse')}
                className="flex w-full items-center justify-center gap-2 rounded-full border border-border/60 bg-card/70 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-card"
              >
                <FolderOpen className="size-4" />
                {t('selectAsset')}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setView('menu')}
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                >
                  <ArrowLeft className="size-3.5" />
                  {t('back')}
                </button>
                {isAddingFromUrl && (
                  <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                )}
              </div>
              <AssetBrowser
                mediaType="image"
                onSelect={handleSelectAsset}
                emptyLabel={t('selectAssetEmpty')}
              />
            </div>
          )}
        </PopoverContent>
      </Popover>
    </>
  )
}
