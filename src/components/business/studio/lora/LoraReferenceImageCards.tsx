'use client'

import { useRef, useState, type ChangeEvent } from 'react'
import { Image as ImageIcon, Plus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { ImagePickerPopoverBody } from '@/components/business/studio-shared/ImagePickerPopoverBody'
import { ParamSlider } from '@/components/ui/param-slider'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import type { NumericRange } from '@/constants/provider-capabilities'
import type { useImageUpload } from '@/hooks/use-image-upload'
import { cn } from '@/lib/utils'
import type { GenerationRecord } from '@/types'

interface LoraReferenceImageCardsProps {
  /** Owned by the parent (GenerateBranch) so handleGenerate can read the
   *  enabled reference URLs; passed in rather than instantiated here. */
  imageUpload: ReturnType<typeof useImageUpload>
  strength: number
  onStrengthChange: (value: number) => void
  strengthConfig: NumericRange
  disabled?: boolean
}

/**
 * G3c 参考图大卡（references/pages/lora-generate.md §3.2）：左栏顶部横排大预览卡
 * ——每张 = 图 + × 移除（点图看大图），末尾同尺寸「＋ 添加」虚线卡（Popover 复用
 * `ImagePickerPopoverBody` 的上传/最近素材/开库）；下方唯一「参考强度」滑杆。空态
 * 只留低高度「＋ 添加参考图」入口，不预留大卡高度、不显示无效强度（§3.2.3）。
 * 与退役的 `LoraReferenceImageChip` 同源能力（`useImageUpload` 状态 +
 * `AssetSelectorDialog`），只换呈现：紧凑 chip → 顶部大卡。
 */
export function LoraReferenceImageCards({
  imageUpload,
  strength,
  onStrengthChange,
  strengthConfig,
  disabled,
}: LoraReferenceImageCardsProps) {
  const t = useTranslations('ImageChip')
  const [addOpen, setAddOpen] = useState(false)
  const [assetDialogOpen, setAssetDialogOpen] = useState(false)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const entries = imageUpload.referenceEntries
  const enabledCount = imageUpload.referenceImages.length
  const hasEntries = entries.length > 0
  const previewEntry =
    previewIndex === null ? null : (entries[previewIndex] ?? null)

  const handleSelectAsset = async (gen: GenerationRecord) => {
    // AssetSelectorDialog is locked to image, but guard so a non-image asset
    // never gets attached as a reference.
    if (gen.outputType !== 'IMAGE') return
    await imageUpload.addFromUrl(gen.url)
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) void imageUpload.handleFileChange(file)
    setAddOpen(false)
  }

  const pickerBody = (
    <ImagePickerPopoverBody
      dropHint={t('dropHint')}
      recentLabel={t('recentAssets')}
      recentEmptyLabel={t('recentAssetsEmpty')}
      openLibraryLabel={t('openLibrary')}
      onPickFile={() => fileInputRef.current?.click()}
      onDropFile={(file) => {
        void imageUpload.handleFileChange(file)
        setAddOpen(false)
      }}
      onPickAsset={(generation) => {
        void handleSelectAsset(generation)
        setAddOpen(false)
      }}
      onOpenLibrary={() => {
        // Close the popover before the full-screen picker so the two focus
        // traps don't fight (mirrors the Studio chip pattern).
        setAddOpen(false)
        setAssetDialogOpen(true)
      }}
    />
  )

  return (
    <div className="space-y-2">
      <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
        {t('referenceLabel')}
      </p>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled}
      />

      {hasEntries ? (
        <>
          <div className="flex flex-wrap gap-2">
            {entries.map((entry, index) => {
              const isDisabled = entry.disabledReason !== null
              const tooltip =
                entry.disabledReason === 'over_limit'
                  ? t('disabledOverLimit')
                  : entry.disabledReason === 'unsupported'
                    ? t('disabledUnsupported')
                    : undefined
              return (
                <div
                  key={`${index}-${entry.url.slice(0, 32)}`}
                  title={tooltip}
                  className={cn(
                    'group relative aspect-square w-36 shrink-0 overflow-hidden rounded-xl border border-border bg-muted/35',
                    isDisabled && 'opacity-55',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setPreviewIndex(index)}
                    aria-label={t('previewReferenceImage', {
                      index: index + 1,
                    })}
                    className="size-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={entry.url}
                      alt=""
                      className={cn(
                        'size-full object-cover transition-transform duration-200 group-hover:scale-105',
                        isDisabled && 'grayscale',
                      )}
                    />
                  </button>
                  {isDisabled ? (
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/35 text-muted-foreground">
                      <ImageIcon className="size-5" aria-hidden />
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => imageUpload.removeReferenceImage(index)}
                    aria-label={t('removeReferenceImage', { index: index + 1 })}
                    className="absolute right-1.5 top-1.5 z-10 flex size-6 items-center justify-center rounded-full border border-black/10 bg-white/90 text-neutral-800 opacity-0 shadow-sm transition-opacity hover:bg-white focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 group-hover:opacity-100"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </div>
              )
            })}
            {/* ＋ 添加 大卡：同尺寸虚线卡，Popover 复用上传/最近/开库。 */}
            <Popover open={addOpen} onOpenChange={setAddOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={t('add')}
                  className="flex aspect-square w-36 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
                >
                  <Plus className="size-5" aria-hidden />
                  <span className="text-2xs font-medium">{t('add')}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" side="bottom" className="w-72">
                {pickerBody}
              </PopoverContent>
            </Popover>
          </div>
          {/* §3.2.3：仅当有可用参考图时才显示唯一「参考强度」。 */}
          {enabledCount > 0 ? (
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
          ) : null}
        </>
      ) : (
        // 空态：只留低高度添加入口，不预留大卡高度、不显示强度。
        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-3 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
            >
              <Plus className="size-3.5" aria-hidden />
              {t('addReference')}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" side="bottom" className="w-72">
            {pickerBody}
          </PopoverContent>
        </Popover>
      )}

      <Dialog
        open={previewEntry !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewIndex(null)
        }}
      >
        <DialogContent
          closeLabel={t('closeReferencePreview')}
          className="w-auto max-w-5xl gap-0 rounded-2xl border-border/60 bg-background/95 p-3 shadow-2xl backdrop-blur-md sm:max-w-5xl"
        >
          <DialogTitle className="sr-only">
            {previewIndex === null
              ? ''
              : t('previewReferenceImage', { index: previewIndex + 1 })}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t('previewReferenceDescription')}
          </DialogDescription>
          {previewEntry ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewEntry.url}
              alt=""
              className="max-w-full rounded-xl object-contain"
              style={{ maxHeight: '80dvh' }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <AssetSelectorDialog
        open={assetDialogOpen}
        onOpenChange={setAssetDialogOpen}
        onSelect={handleSelectAsset}
        title={t('selectAsset')}
        description={t('description')}
        mediaType="image"
      />
    </div>
  )
}
