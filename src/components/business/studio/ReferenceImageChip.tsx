'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import { ChevronRight, Image as ImageIcon, Layers } from 'lucide-react'
import { useTranslations } from 'next-intl'
import * as Toolbar from '@radix-ui/react-toolbar'

import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { ImageAttachmentPreviewStrip } from '@/components/business/ImageAttachmentPreviewStrip'
import { ImagePickerPopoverBody } from '@/components/business/studio-shared/ImagePickerPopoverBody'
import { useStudioData, useStudioForm } from '@/contexts/studio-context'
import { cn } from '@/lib/utils'
import type { GenerationRecord } from '@/types'
import {
  StudioChipBadge,
  StudioToolPopoverContent,
  StudioToolSurface,
  StudioToolSurfaceTrigger,
  studioChipActiveClass,
  studioToolTriggerClass,
} from '@/components/business/studio-shared/primitives/tool-surface'

interface ReferenceImageChipProps {
  disabled?: boolean
}

/**
 * ReferenceImageChip — Krea-style "Image" chip combining Upload + Select asset
 * into a single compose-bar entry point.
 *
 *   tap chip       → popover: drag/paste/upload dropzone + recent assets +
 *                     asset library (shared ImagePickerPopoverBody — same UI
 *                     as the prompt assistant's image entry, docs/plans/
 *                     assistant-ux-batch-2026-07.md Slice C)
 *   tap Upload     → native file picker, base64 → addReferenceImage
 *   tap Select     → close popover, open full-screen AssetSelectorDialog
 *                     (Krea-style sidebar + grid). Picking a tile fetches
 *                     the asset via addFromUrl and dismisses the dialog.
 *
 * All paths feed the same useImageUpload store, so downstream generation
 * code is unchanged.
 */
export function ReferenceImageChip({ disabled }: ReferenceImageChipProps) {
  const t = useTranslations('ImageChip')
  const { state, dispatch } = useStudioForm()
  const { imageUpload } = useStudioData()
  const [assetDialogOpen, setAssetDialogOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const popoverOpen = state.panels.refImage

  const enabledReferenceCount = imageUpload.referenceImages.length
  const totalEntries = imageUpload.referenceEntries.length
  const isActive = totalEntries > 0
  const badgeWarning =
    totalEntries > 0 && enabledReferenceCount === 0
      ? t('disabledUnsupported')
      : undefined

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

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) handleFileSelect(file)
    closePopover()
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

  const handleRequestLayerDecompose = () => {
    closePopover()
    dispatch({ type: 'OPEN_PANEL', payload: 'layerDecompose' })
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
            title={badgeWarning}
            className={cn(
              studioToolTriggerClass,
              (isActive || popoverOpen) && studioChipActiveClass,
            )}
          >
            <ImageIcon className="size-4 shrink-0" />
            <span className="hidden sm:inline">{t('label')}</span>
            {totalEntries > 0 && (
              <StudioChipBadge title={badgeWarning} ariaLabel={badgeWarning}>
                {totalEntries}
              </StudioChipBadge>
            )}
          </Toolbar.Button>
        </StudioToolSurfaceTrigger>

        <StudioToolPopoverContent
          size="action"
          side="top"
          align="center"
          label={t('label')}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
            disabled={disabled}
          />
          <ImagePickerPopoverBody
            dropHint={t('dropHint')}
            recentLabel={t('recentAssets')}
            recentEmptyLabel={t('recentAssetsEmpty')}
            openLibraryLabel={t('openLibrary')}
            onPickFile={() => fileInputRef.current?.click()}
            onDropFile={(file) => {
              handleFileSelect(file)
              closePopover()
            }}
            onPickAsset={(generation) => {
              void handleSelectAsset(generation)
              closePopover()
            }}
            onOpenLibrary={handleRequestAssetDialog}
            headerSlot={
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
            footerSlot={
              <div className="border-t border-border/40 pt-2.5">
                <button
                  type="button"
                  title={t('layerDecompose')}
                  disabled={disabled}
                  onClick={handleRequestLayerDecompose}
                  className="group/row flex min-h-11 w-full items-center justify-start gap-3 rounded-xl px-2.5 py-2 text-left text-sm font-medium leading-5 text-foreground transition-colors duration-base ease-standard hover:bg-muted/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground ring-1 ring-inset ring-border/40 transition-colors duration-base ease-standard group-hover/row:bg-muted group-hover/row:text-foreground group-hover/row:ring-border">
                    <Layers className="size-4 shrink-0" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    {t('layerDecompose')}
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground/50 transition-[color,transform] duration-base ease-standard group-hover/row:translate-x-0.5 group-hover/row:text-muted-foreground"
                    aria-hidden
                  />
                </button>
              </div>
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
