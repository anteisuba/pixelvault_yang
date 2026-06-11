'use client'

import { useState } from 'react'
import { Image as ImageIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import * as Toolbar from '@radix-ui/react-toolbar'

import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { ImageAttachmentPreviewStrip } from '@/components/business/ImageAttachmentPreviewStrip'
import { ImageSourcePicker } from '@/components/business/ImageSourcePicker'
import { useStudioData, useStudioForm } from '@/contexts/studio-context'
import { cn } from '@/lib/utils'
import type { GenerationRecord } from '@/types'
import {
  StudioToolPopoverContent,
  StudioToolSurface,
  StudioToolSurfaceTrigger,
  studioToolTriggerClass,
} from '@/components/business/studio-shared/primitives/tool-surface'

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
  const { state, dispatch } = useStudioForm()
  const { imageUpload } = useStudioData()
  const [assetDialogOpen, setAssetDialogOpen] = useState(false)
  const popoverOpen = state.panels.refImage

  const enabledReferenceCount = imageUpload.referenceImages.length
  const totalEntries = imageUpload.referenceEntries.length
  const isActive = totalEntries > 0

  const closePopover = () => {
    dispatch({ type: 'CLOSE_PANEL', payload: 'refImage' })
  }

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

  const handleRequestAssetDialog = () => {
    closePopover()
    setAssetDialogOpen(true)
  }

  return (
    <>
      <StudioToolSurface
        open={popoverOpen}
        onOpenChange={(nextOpen) =>
          dispatch({
            type: nextOpen ? 'OPEN_PANEL' : 'CLOSE_PANEL',
            payload: 'refImage',
          })
        }
      >
        <StudioToolSurfaceTrigger asChild>
          <Toolbar.Button
            type="button"
            disabled={disabled}
            aria-label={t('label')}
            className={cn(
              studioToolTriggerClass,
              (isActive || popoverOpen) && 'bg-muted/30 text-primary',
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
        </StudioToolSurfaceTrigger>

        <StudioToolPopoverContent
          size="action"
          side="top"
          align="center"
          label={t('label')}
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
            onRequestClose={closePopover}
            onRequestAssetDialog={handleRequestAssetDialog}
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
        </StudioToolPopoverContent>
      </StudioToolSurface>

      <AssetSelectorDialog
        open={assetDialogOpen}
        onOpenChange={setAssetDialogOpen}
        onSelect={handleSelectAsset}
        title={t('selectAsset')}
        description={t('description')}
        mediaType="image"
      />
    </>
  )
}
