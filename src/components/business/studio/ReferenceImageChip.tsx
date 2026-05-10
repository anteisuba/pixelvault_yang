'use client'

import { useState } from 'react'
import { Image as ImageIcon, Loader2 } from 'lucide-react'
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

/**
 * ReferenceImageChip — Krea-style "Asset" chip for the Studio compose bar.
 * Opens a popover that renders <AssetBrowser /> over the user's saved
 * generations. Tapping a thumbnail fetches the asset and pushes it into
 * the existing reference-image store via useImageUpload.addFromUrl, so
 * the same downstream generate code path consumes both file uploads
 * (legacy "参照画像" panel) and archive-picked images (this chip).
 *
 * Phase 5.5 — pairs with Phase 5.4's AssetBrowser. Coexists with the
 * legacy reference-image panel for now; a later phase can fold both
 * entry points into a single Image chip with Upload / Select tabs.
 */
export function ReferenceImageChip({ disabled }: ReferenceImageChipProps) {
  const t = useTranslations('ImageChip')
  const { imageUpload } = useStudioData()
  const [open, setOpen] = useState(false)
  const [isAdding, setIsAdding] = useState(false)

  const referenceCount = imageUpload.referenceImages.length
  const isActive = referenceCount > 0

  const handleSelect = async (gen: GenerationRecord) => {
    if (isAdding) return
    setIsAdding(true)
    try {
      await imageUpload.addFromUrl(gen.url)
      setOpen(false)
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
        <div className="mb-3 flex items-center justify-between">
          <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground/70">
            {t('selectFromArchive')}
          </span>
          {isAdding && (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          )}
        </div>
        <AssetBrowser
          mediaType="image"
          onSelect={handleSelect}
          emptyLabel={t('selectAssetEmpty')}
        />
      </PopoverContent>
    </Popover>
  )
}
