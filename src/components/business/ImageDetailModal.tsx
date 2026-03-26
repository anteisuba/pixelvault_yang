'use client'
/* eslint-disable @next/next/no-img-element */

import { useState } from 'react'

import {
  ArrowUpRight,
  Check,
  Coins,
  Copy,
  Download,
  Eraser,
  Globe2,
  ImageIcon,
  Link2,
  Loader2,
  LockKeyhole,
  Sparkles,
  Trash2,
  ZoomIn,
} from 'lucide-react'
import { toast } from 'sonner'
import { useFormatter, useLocale, useTranslations } from 'next-intl'

import { ROUTES } from '@/constants/routes'
import { isCjkLocale } from '@/i18n/routing'
import { Link } from '@/i18n/navigation'

import { editImageAPI } from '@/lib/api-client'
import type { GenerationRecord } from '@/types'
import VideoPlayer from '@/components/business/VideoPlayer'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { MetadataList } from '@/components/ui/metadata-list'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { cn, getLabelClassName } from '@/lib/utils'

interface ImageDetailModalProps {
  generation: GenerationRecord
  open: boolean
  onOpenChange: (open: boolean) => void
  showVisibility?: boolean
  showDelete?: boolean
  onDelete?: (id: string) => void
}

export function ImageDetailModal({
  generation,
  open,
  onOpenChange,
  showVisibility = false,
  showDelete = false,
  onDelete,
}: ImageDetailModalProps) {
  const [isDownloading, setIsDownloading] = useState(false)
  const [copied, setCopied] = useState<'prompt' | 'link' | null>(null)
  const [editingAction, setEditingAction] = useState<
    'upscale' | 'remove-background' | null
  >(null)
  const format = useFormatter()
  const locale = useLocale()
  const isDenseLocale = isCjkLocale(locale)
  const t = useTranslations('ImageDetail')
  const tCard = useTranslations('GalleryCard')
  const tCommon = useTranslations('Common')
  const tModels = useTranslations('Models')

  const createdAt = new Date(generation.createdAt)
  const modelLabel = getTranslatedModelLabel(tModels, generation.model)

  const aspectRatio = `${Math.max(generation.width, 1)} / ${Math.max(
    generation.height,
    1,
  )}`

  const handleDownload = async () => {
    if (isDownloading) return
    setIsDownloading(true)
    try {
      const response = await fetch(generation.url)
      const blob = await response.blob()
      const blobUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      const ext = generation.mimeType.split('/')[1] || 'png'
      link.download = `pixelvault-${generation.id.slice(0, 8)}.${ext}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(blobUrl)
    } catch {
      window.open(generation.url, '_blank')
    } finally {
      setIsDownloading(false)
    }
  }

  const labelClass = getLabelClassName(isDenseLocale)

  const metadata = [
    { label: tCard('modelLabel'), value: modelLabel, key: 'model' },
    {
      label: tCard('providerLabel'),
      value: generation.provider,
      key: 'provider',
    },
    {
      label: tCard('requestsLabel'),
      value: tCommon('creditCount', { count: generation.requestCount }),
      key: 'requests',
      icon: <Coins className="size-3 text-primary" />,
    },
    {
      label: t('dimensionsLabel'),
      value: `${generation.width} \u00d7 ${generation.height}`,
      key: 'dimensions',
    },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90svh] max-w-4xl gap-0 overflow-y-auto rounded-3xl border-border/75 bg-card p-0"
        showCloseButton
      >
        <DialogTitle className="sr-only">{t('title')}</DialogTitle>
        <DialogDescription className="sr-only">
          {showVisibility || generation.isPromptPublic
            ? generation.prompt
            : t('title')}
        </DialogDescription>

        <div className="overflow-hidden rounded-t-3xl bg-secondary/18">
          {generation.outputType === 'VIDEO' ? (
            <VideoPlayer
              src={generation.url}
              width={generation.width}
              height={generation.height}
              className="max-h-[60svh] rounded-none border-0"
            />
          ) : (
            <img
              src={generation.url}
              alt={generation.prompt}
              className="h-auto max-h-[60svh] w-full object-contain"
              style={{ aspectRatio }}
            />
          )}
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <p
              className={cn(
                'text-nav font-semibold text-muted-foreground',
                isDenseLocale
                  ? 'tracking-normal normal-case'
                  : 'uppercase tracking-nav',
              )}
            >
              {format.dateTime(createdAt, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>

            <div className="flex items-center gap-2">
              {showVisibility ? (
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    {generation.isPublic ? (
                      <Globe2 className="size-3 text-chart-2" />
                    ) : (
                      <LockKeyhole className="size-3" />
                    )}
                    {tCard('imageVisibilityShort', {
                      status: generation.isPublic
                        ? tCard('publicLabel')
                        : tCard('privateLabel'),
                    })}
                  </span>
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    {generation.isPromptPublic ? (
                      <Globe2 className="size-3 text-chart-2" />
                    ) : (
                      <LockKeyhole className="size-3" />
                    )}
                    {tCard('promptVisibilityShort', {
                      status: generation.isPromptPublic
                        ? tCard('publicLabel')
                        : tCard('privateLabel'),
                    })}
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          {showVisibility || generation.isPromptPublic ? (
            <>
              <div className="space-y-2">
                <p className={labelClass}>{t('promptLabel')}</p>
                <p className="font-serif text-base leading-7 text-foreground">
                  {generation.prompt}
                </p>
              </div>

              {generation.negativePrompt ? (
                <div className="space-y-2">
                  <p className={labelClass}>{t('negativePromptLabel')}</p>
                  <p className="font-serif text-sm leading-6 text-muted-foreground">
                    {generation.negativePrompt}
                  </p>
                </div>
              ) : null}
            </>
          ) : (
            <p className="flex items-center gap-1.5 font-serif text-sm italic text-muted-foreground">
              <LockKeyhole className="size-3" />
              {tCard('promptPrivateHint')}
            </p>
          )}

          {generation.referenceImageUrl ? (
            <div className="space-y-2">
              <p className={cn(labelClass, 'flex items-center gap-1.5')}>
                <ImageIcon className="size-3" />
                {t('referenceImageLabel')}
              </p>
              <a
                href={generation.referenceImageUrl}
                target="_blank"
                rel="noreferrer"
                className="block w-fit"
              >
                <img
                  src={generation.referenceImageUrl}
                  alt={t('referenceImageLabel')}
                  className="h-auto max-h-40 rounded-xl border border-border/70 object-contain"
                />
              </a>
            </div>
          ) : null}

          <MetadataList items={metadata} labelClassName={labelClass} />

          <div className="flex flex-wrap gap-2 border-t border-border/70 pt-4">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => void handleDownload()}
              disabled={isDownloading}
            >
              <Download className="size-3.5" />
              {isDownloading ? t('downloading') : t('download')}
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              asChild
            >
              <a href={generation.url} target="_blank" rel="noreferrer">
                <ArrowUpRight className="size-3.5" />
                {t('openOriginal')}
              </a>
            </Button>

            {(showVisibility || generation.isPromptPublic) && (
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={async () => {
                  await navigator.clipboard.writeText(generation.prompt)
                  setCopied('prompt')
                  setTimeout(() => setCopied(null), 2000)
                }}
              >
                {copied === 'prompt' ? (
                  <Check className="size-3.5 text-chart-3" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                {copied === 'prompt' ? t('promptCopied') : t('copyPrompt')}
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={async () => {
                const url = `${window.location.origin}/gallery/${generation.id}`
                await navigator.clipboard.writeText(url)
                setCopied('link')
                setTimeout(() => setCopied(null), 2000)
              }}
            >
              {copied === 'link' ? (
                <Check className="size-3.5 text-chart-3" />
              ) : (
                <Link2 className="size-3.5" />
              )}
              {copied === 'link' ? t('linkCopied') : t('shareLink')}
            </Button>

            {(showVisibility || generation.isPromptPublic) && (
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                asChild
              >
                <Link
                  href={`${ROUTES.STUDIO}?prompt=${encodeURIComponent(generation.prompt)}&model=${encodeURIComponent(generation.model)}`}
                >
                  <Sparkles className="size-3.5" />
                  {t('generateWithPrompt')}
                </Link>
              </Button>
            )}

            {generation.outputType === 'IMAGE' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  disabled={editingAction !== null}
                  onClick={async () => {
                    setEditingAction('upscale')
                    const result = await editImageAPI('upscale', generation.url)
                    setEditingAction(null)
                    if (result.success && result.data) {
                      window.open(result.data.imageUrl, '_blank')
                      toast.success(t('editSuccess'))
                    } else {
                      toast.error(result.error ?? t('editFailed'))
                    }
                  }}
                >
                  {editingAction === 'upscale' ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <ZoomIn className="size-3.5" />
                  )}
                  {editingAction === 'upscale' ? t('upscaling') : t('upscale')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  disabled={editingAction !== null}
                  onClick={async () => {
                    setEditingAction('remove-background')
                    const result = await editImageAPI(
                      'remove-background',
                      generation.url,
                    )
                    setEditingAction(null)
                    if (result.success && result.data) {
                      window.open(result.data.imageUrl, '_blank')
                      toast.success(t('editSuccess'))
                    } else {
                      toast.error(result.error ?? t('editFailed'))
                    }
                  }}
                >
                  {editingAction === 'remove-background' ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Eraser className="size-3.5" />
                  )}
                  {editingAction === 'remove-background'
                    ? t('removingBackground')
                    : t('removeBackground')}
                </Button>
              </>
            )}

            {showDelete && onDelete ? (
              <ConfirmDialog
                trigger={
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                    {t('delete')}
                  </Button>
                }
                title={t('deleteConfirmTitle')}
                description={t('deleteConfirmDescription')}
                cancelLabel={t('deleteCancel')}
                confirmLabel={t('deleteConfirm')}
                onConfirm={() => {
                  onDelete(generation.id)
                  onOpenChange(false)
                }}
              />
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
