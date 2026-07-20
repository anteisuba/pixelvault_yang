'use client'

import { Check, ImageIcon, RefreshCw, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'

import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

interface CardifyPreviewProps {
  originalImage: string
  renderedImage: string | null
  isRendering: boolean
  isSubmitting: boolean
  error: string | null
  onAccept: () => void
  onRegenerate: () => void
  onUseOriginal: () => void
  onCancel: () => void
}

export function CardifyPreview({
  originalImage,
  renderedImage,
  isRendering,
  isSubmitting,
  error,
  onAccept,
  onRegenerate,
  onUseOriginal,
  onCancel,
}: CardifyPreviewProps) {
  const t = useTranslations('Cardify')
  const busy = isRendering || isSubmitting

  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-background/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium font-display">{t('title')}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          aria-label={t('close')}
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <PreviewPane label={t('original')} imageUrl={originalImage} />
        <PreviewPane
          label={t('rendered')}
          imageUrl={renderedImage}
          isLoading={isRendering}
          placeholder={t('renderingHint')}
        />
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onAccept}
          disabled={busy || !renderedImage}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {isSubmitting ? (
            <Spinner size="sm" />
          ) : (
            <Check className="size-3.5" />
          )}
          {t('accept')}
        </button>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-md border border-border/60 px-3 py-2 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw
            className={cn('size-3.5', isRendering && 'animate-spin')}
          />
          {t('regenerate')}
        </button>
        <button
          type="button"
          onClick={onUseOriginal}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-md border border-border/60 px-3 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <ImageIcon className="size-3.5" />
          {t('useOriginal')}
        </button>
      </div>
    </div>
  )
}

interface PreviewPaneProps {
  label: string
  imageUrl: string | null
  isLoading?: boolean
  placeholder?: string
}

function PreviewPane({
  label,
  imageUrl,
  isLoading = false,
  placeholder,
}: PreviewPaneProps) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="relative aspect-[3/4] overflow-hidden rounded-md border border-border/60 bg-muted/30">
        {isLoading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Spinner size="lg" />
            {placeholder && (
              <p className="px-3 text-center text-xs">{placeholder}</p>
            )}
          </div>
        ) : imageUrl ? (
          <Image
            src={imageUrl}
            alt={label}
            fill
            sizes="200px"
            className="object-cover"
            unoptimized={imageUrl.startsWith('data:')}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/40">
            <ImageIcon className="size-6" />
          </div>
        )}
      </div>
    </div>
  )
}
