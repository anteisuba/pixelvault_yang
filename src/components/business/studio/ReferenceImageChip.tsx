'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import { Image as ImageIcon } from 'lucide-react'
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
 *                     docs/references/pages/assistant-shell.md)
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

  /**
   * ⚠ 消费端是 `imageUpload.addFromUrl` —— **追加**语义、且有容量
   * （`useImageUpload.maxImages`）。按 page §8.3 的判据，这种入口应当是
   * **多选**：以前挂成单选，放 4 张参考图要开 4 次弹窗。
   */
  const remainingReferenceSlots = Number.isFinite(imageUpload.maxImages)
    ? Math.max(0, imageUpload.maxImages - imageUpload.referenceEntries.length)
    : undefined

  const handleSelectAssets = async (gens: GenerationRecord[]) => {
    for (const gen of gens) {
      await handleSelectAsset(gen)
    }
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
          />
        </StudioToolPopoverContent>
      </StudioToolSurface>

      <AssetSelectorDialog
        open={assetDialogOpen}
        onOpenChange={setAssetDialogOpen}
        multiSelect
        maxSelection={remainingReferenceSlots}
        onConfirmMany={(gens) => void handleSelectAssets(gens)}
        title={t('selectAsset')}
        description={t('description')}
        mediaType="image"
      />
    </>
  )
}
