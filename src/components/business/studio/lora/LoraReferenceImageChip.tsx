'use client'

import { useState } from 'react'
import { Image as ImageIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { ImageAttachmentPreviewStrip } from '@/components/business/ImageAttachmentPreviewStrip'
import { ImageSourcePicker } from '@/components/business/ImageSourcePicker'
import { ParamSlider } from '@/components/ui/param-slider'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import type { NumericRange } from '@/constants/provider-capabilities'
import type { useImageUpload } from '@/hooks/use-image-upload'
import { cn } from '@/lib/utils'
import type { GenerationRecord } from '@/types'

interface LoraReferenceImageChipProps {
  /** Owned by the parent (GenerateBranch) so handleGenerate can read the
   *  enabled reference URLs; passed in rather than instantiated here. */
  imageUpload: ReturnType<typeof useImageUpload>
  strength: number
  onStrengthChange: (value: number) => void
  strengthConfig: NumericRange
  disabled?: boolean
}

/**
 * B9 (D6): reference-image (img2img) chip for the LoRA generate paper. Borrows
 * the Studio composer's building blocks (useImageUpload state, ImageSourcePicker,
 * ImageAttachmentPreviewStrip, AssetSelectorDialog) but owns a plain Popover +
 * chip instead of the Studio Toolbar/panels reducer — the LoRA domain has no
 * Studio context. Capability gating (whether to render this chip at all) lives
 * in the parent via getMaxReferenceImages.
 */
export function LoraReferenceImageChip({
  imageUpload,
  strength,
  onStrengthChange,
  strengthConfig,
  disabled,
}: LoraReferenceImageChipProps) {
  const t = useTranslations('ImageChip')
  const [open, setOpen] = useState(false)
  const [assetDialogOpen, setAssetDialogOpen] = useState(false)

  const enabledCount = imageUpload.referenceImages.length
  const totalEntries = imageUpload.referenceEntries.length
  const isActive = totalEntries > 0
  // All entries disabled (e.g. base switched to a no-reference model but we
  // keep the uploads around) → warn on the badge.
  const warning =
    totalEntries > 0 && enabledCount === 0
      ? t('disabledUnsupported')
      : undefined

  const handleSelectAsset = async (gen: GenerationRecord) => {
    // Defensive: AssetSelectorDialog is locked to mediaType="image", but guard
    // anyway so a video/audio asset never gets attached as a reference image.
    if (gen.outputType !== 'IMAGE') return
    await imageUpload.addFromUrl(gen.url)
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={t('label')}
            title={warning}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors disabled:opacity-50',
              isActive || open
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border/60 text-muted-foreground hover:border-primary/20 hover:text-foreground',
            )}
          >
            <ImageIcon className="size-3.5" aria-hidden />
            {t('label')}
            {totalEntries > 0 ? (
              <span
                className={cn(
                  'inline-flex min-w-4 items-center justify-center rounded-full px-1 text-2xs font-semibold',
                  warning
                    ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                    : 'bg-primary/20 text-primary',
                )}
                title={warning}
              >
                {totalEntries}
              </span>
            ) : null}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" side="top" className="w-72 space-y-2.5">
          <ImageSourcePicker
            variant="card"
            description={t('description')}
            uploadLabel={t('upload')}
            uploadHint={t('uploadHint')}
            selectAssetLabel={t('selectAsset')}
            assetDialogTitle={t('selectAsset')}
            assetDialogDescription={t('description')}
            pasteHint={t('pasteHint')}
            disabled={disabled}
            onFileSelect={(file) => imageUpload.handleFileChange(file)}
            onAssetSelect={handleSelectAsset}
            onRequestClose={() => setOpen(false)}
            onRequestAssetDialog={() => {
              // Close the popover before the full-screen picker so the two
              // focus traps don't fight (mirrors the Studio chip pattern).
              setOpen(false)
              setAssetDialogOpen(true)
            }}
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
          {enabledCount > 0 ? (
            <div className="border-t border-border/40 pt-2.5">
              <ParamSlider
                label={t('referenceStrength')}
                hint={t('referenceStrengthHint')}
                value={strength}
                onChange={onStrengthChange}
                min={strengthConfig.min}
                max={strengthConfig.max}
                step={strengthConfig.step}
                formatValue={(value) => `${Math.round(value * 100)}%`}
              />
            </div>
          ) : null}
        </PopoverContent>
      </Popover>

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
