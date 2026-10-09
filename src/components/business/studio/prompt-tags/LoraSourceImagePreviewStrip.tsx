'use client'

import { useRef, useState } from 'react'
import { Copy } from '@/components/icons'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  LORA_CARD_SOURCE_IMAGE_WIDTH,
  LORA_DETAIL_IMAGE_WIDTH,
} from '@/constants/lora'
import { COPIED_ACK_MS } from '@/constants/motion'
import { civitaiDisplayImageUrl } from '@/lib/civitai-image-url'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  FeedbackButton,
  useButtonFeedback,
} from '@/components/ui/feedback-button'
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
  /** `band` = 桌面生成台 B 的来源图带（提示在带子头上，缩略图放大一档）。 */
  size?: 'strip' | 'band'
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
  size = 'strip',
}: LoraSourceImagePreviewStripProps) {
  const band = size === 'band'
  const t = useTranslations('LoraPromptControl.generate')
  const [preview, setPreview] = useState<SourceImagePreview | null>(null)
  const copied = useButtonFeedback(COPIED_ACK_MS)
  // 来源图带里作者描述默认收成一行（次要信息收起，⛔ 整段 markdown 铺在舞台上）。
  const [descriptionOpen, setDescriptionOpen] = useState(false)
  const previewTriggerRef = useRef<HTMLButtonElement | null>(null)

  const trimmedDescription = descriptionText?.trim() || ''
  const hasPreviews = previewImages.length > 0
  const hasDescription = trimmedDescription.length > 0

  if (!hasPreviews && !hasDescription) return null

  const handleCopyDescription = async () => {
    try {
      await navigator.clipboard.writeText(trimmedDescription)
      // 复制好了写在「复制」键上（ui-defaults §7.1），失败照旧底部黑条红点。
      copied.show({ label: t('descriptionCopied') })
    } catch {
      toast.error(t('descriptionCopyFailed'))
    }
  }

  return (
    <div className={cn('space-y-2.5', !band && 'mt-2.5')}>
      {hasPreviews ? (
        <div>
          {band ? null : (
            <p className="text-2xs leading-relaxed text-muted-foreground">
              {t('previewOnlyHint')}
            </p>
          )}
          <div
            className={cn(
              'lora-scrollbar-hide flex overflow-x-auto',
              band ? 'gap-2.5' : 'mt-1 gap-1.5 pb-1',
            )}
          >
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
                      url: civitaiDisplayImageUrl(
                        image.imageUrl,
                        LORA_DETAIL_IMAGE_WIDTH,
                      ),
                      label: imageLabel,
                    })
                  }}
                  aria-label={t('sourceImagePreviewLabel', {
                    name: assetName,
                    n: idx + 1,
                  })}
                  className={cn(
                    'shrink-0 cursor-zoom-in overflow-hidden outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    band
                      ? 'rounded-lg bg-muted hover:ring-2 hover:ring-foreground/15'
                      : 'rounded-md border border-border/60 hover:border-primary/40',
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={civitaiDisplayImageUrl(
                      image.imageUrl,
                      LORA_CARD_SOURCE_IMAGE_WIDTH,
                    )}
                    alt=""
                    loading="lazy"
                    className={cn(
                      'object-cover',
                      band ? 'h-22 w-16.5' : 'h-24 w-20',
                    )}
                  />
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {hasDescription && band ? (
        <div className="flex min-w-0 items-start gap-2.5 text-xs">
          <span className="shrink-0 pt-px font-medium text-muted-foreground">
            {t('descriptionShort')}
          </span>
          <p
            className={cn(
              'min-w-0 flex-1 break-words text-foreground/80',
              descriptionOpen
                ? 'max-h-40 overflow-y-auto overscroll-contain whitespace-pre-wrap'
                : 'truncate',
            )}
          >
            {descriptionOpen
              ? trimmedDescription
              : trimmedDescription.replace(/\s+/g, ' ')}
          </p>
          <button
            type="button"
            onClick={() => setDescriptionOpen((open) => !open)}
            aria-expanded={descriptionOpen}
            className="shrink-0 font-medium text-foreground underline-offset-3 hover:underline"
          >
            {descriptionOpen
              ? t('descriptionCollapse')
              : t('descriptionExpand')}
          </button>
          <FeedbackButton
            feedback={copied.feedback}
            disabled={disabled}
            onClick={handleCopyDescription}
            className="inline-flex shrink-0 items-center gap-1 rounded-full text-muted-foreground hover:text-foreground"
          >
            <Copy className="size-3.5" aria-hidden />
            {t('descriptionCopy')}
          </FeedbackButton>
        </div>
      ) : hasDescription ? (
        <div className="rounded-md border border-dashed border-border/70 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-2xs font-medium text-muted-foreground">
              {t('descriptionLabel')}
            </p>
            <FeedbackButton
              feedback={copied.feedback}
              disabled={disabled}
              onClick={handleCopyDescription}
              className={buttonVariants({ variant: 'outline', size: 'xs' })}
            >
              <Copy className="size-3.5" aria-hidden />
              {t('descriptionCopy')}
            </FeedbackButton>
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
