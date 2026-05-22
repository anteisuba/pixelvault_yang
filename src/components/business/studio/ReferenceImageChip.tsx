'use client'

import { useState } from 'react'
import { Image as ImageIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import * as Toolbar from '@radix-ui/react-toolbar'

import { ImageAttachmentPreviewStrip } from '@/components/business/ImageAttachmentPreviewStrip'
import { ImageSourcePicker } from '@/components/business/ImageSourcePicker'
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
 * Both paths feed the same useImageUpload store through ImageSourcePicker, so
 * downstream generation code is unchanged.
 */
export function ReferenceImageChip({ disabled }: ReferenceImageChipProps) {
  const t = useTranslations('ImageChip')
  const { imageUpload } = useStudioData()
  const [popoverOpen, setPopoverOpen] = useState(false)

  const enabledReferenceCount = imageUpload.referenceImages.length
  const totalEntries = imageUpload.referenceEntries.length
  const isActive = totalEntries > 0

  const handleFileSelect = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      imageUpload.addReferenceImage(reader.result as string)
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
            {totalEntries > 0 && (
              <span
                className={cn(
                  'absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full text-[10px]',
                  enabledReferenceCount > 0
                    ? 'bg-primary text-white'
                    : 'bg-muted-foreground text-background',
                )}
              >
                {totalEntries}
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
          <ImageSourcePicker
            description={t('description')}
            uploadLabel={t('upload')}
            uploadHint={t('uploadHint')}
            selectAssetLabel={t('selectAsset')}
            assetDialogTitle={t('selectAsset')}
            assetDialogDescription={t('description')}
            pasteHint={t('pasteHint')}
            onFileSelect={handleFileSelect}
            onAssetSelect={handleSelectAsset}
            onRequestClose={() => setPopoverOpen(false)}
            preview={
              totalEntries > 0 ? (
                <ImageAttachmentPreviewStrip
                  entries={imageUpload.referenceEntries}
                  previewAlt={t('label')}
                  removeLabel={(index) => t('removeReferenceImage', { index })}
                  onRemove={imageUpload.removeReferenceImage}
                  overLimitTooltip={t('disabledOverLimit')}
                  unsupportedTooltip={t('disabledUnsupported')}
                />
              ) : null
            }
          />
        </PopoverContent>
      </Popover>
    </>
  )
}
