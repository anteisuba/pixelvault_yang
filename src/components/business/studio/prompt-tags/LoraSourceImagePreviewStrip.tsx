'use client'

import { useRef, useState } from 'react'
import { Copy } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { LORA_CARD_SOURCE_IMAGE_WIDTH } from '@/constants/lora'
import {
  proxyCivitaiImageUrl,
  rewriteCivitaiImageUrl,
} from '@/lib/civitai-image-url'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import type { CivitaiPreviewImage } from '@/types'

interface LoraSourceImagePreviewStripProps {
  assetName: string
  previewImages: readonly CivitaiPreviewImage[]
  /**
   * 方案 B：作者 model.description 的纯文本。无配方兜底时原样展示 + 复制，
   * 不做任何解析/猜测（用户明确要零误判）。
   */
  descriptionText?: string | null
  disabled?: boolean
}

interface SourceImagePreview {
  url: string
  label: string
}

/**
 * 无配方兜底：当某把 LoRA 的作者示例图没带 prompt 元数据（无法「一键同款」）时，
 * 把作者写的东西尽量摆出来 —— (1) 静态示例图当**纯预览图**（点开看大图），
 * (2) 作者描述**原样文本 + 复制按钮**（推荐词常写在描述里，用户自己挑着复制）。
 * 都不涉及生成/配方解析。区别于 LoraSourceRecipeStrip（后者的图都带可复刻 prompt）。
 */
export function LoraSourceImagePreviewStrip({
  assetName,
  previewImages,
  descriptionText,
  disabled,
}: LoraSourceImagePreviewStripProps) {
  const t = useTranslations('LoraPromptControl.generate')
  const [preview, setPreview] = useState<SourceImagePreview | null>(null)
  const previewTriggerRef = useRef<HTMLButtonElement | null>(null)

  const trimmedDescription = descriptionText?.trim() || ''
  const hasPreviews = previewImages.length > 0
  const hasDescription = trimmedDescription.length > 0

  if (!hasPreviews && !hasDescription) return null

  const handleCopyDescription = async () => {
    try {
      await navigator.clipboard.writeText(trimmedDescription)
      toast.success(t('descriptionCopied'))
    } catch {
      toast.error(t('descriptionCopyFailed'))
    }
  }

  return (
    <div className="mt-2.5 space-y-2.5">
      {hasPreviews ? (
        <div>
          <p className="text-2xs leading-relaxed text-muted-foreground">
            {t('previewOnlyHint')}
          </p>
          <div className="lora-scrollbar-hide mt-1 flex gap-1.5 overflow-x-auto pb-1">
            {previewImages.map((image, idx) => {
              const imageLabel = t('sourceImageAlt', {
                name: assetName,
                n: idx + 1,
              })
              return (
                <button
                  key={image.imageUrl}
                  type="button"
                  disabled={disabled}
                  onClick={(event) => {
                    previewTriggerRef.current = event.currentTarget
                    setPreview({
                      url: proxyCivitaiImageUrl(image.imageUrl),
                      label: imageLabel,
                    })
                  }}
                  aria-label={t('sourceImagePreviewLabel', {
                    name: assetName,
                    n: idx + 1,
                  })}
                  className="shrink-0 cursor-zoom-in overflow-hidden rounded-md border border-border/60 outline-none transition-shadow hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={proxyCivitaiImageUrl(
                      rewriteCivitaiImageUrl(image.imageUrl, {
                        width: LORA_CARD_SOURCE_IMAGE_WIDTH,
                      }),
                    )}
                    alt=""
                    loading="lazy"
                    className="h-24 w-20 object-cover"
                  />
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {hasDescription ? (
        <div className="rounded-md border border-dashed border-border/70 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-2xs font-medium text-muted-foreground">
              {t('descriptionLabel')}
            </p>
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={disabled}
              onClick={handleCopyDescription}
            >
              <Copy className="size-3.5" aria-hidden />
              {t('descriptionCopy')}
            </Button>
          </div>
          <p className="mt-1.5 max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-2xs leading-relaxed text-foreground/90">
            {trimmedDescription}
          </p>
        </div>
      ) : null}

      <Dialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null)
        }}
      >
        <DialogContent
          closeLabel={t('sourceImagePreviewClose')}
          className="w-auto max-w-[min(92vw,720px)] gap-0 rounded-2xl border-border/60 bg-background/95 p-3 shadow-2xl backdrop-blur-md sm:max-w-[min(92vw,720px)]"
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            previewTriggerRef.current?.focus()
          }}
        >
          <DialogTitle className="sr-only">{preview?.label ?? ''}</DialogTitle>
          <DialogDescription className="sr-only">
            {t('sourceImagePreviewDescription')}
          </DialogDescription>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview.url}
              alt={preview.label}
              className="max-h-[75vh] max-w-full rounded-lg object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
