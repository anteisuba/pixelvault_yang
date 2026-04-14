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
  Layers,
  Link2,
  Loader2,
  LockKeyhole,
  Pin,
  Sparkles,
  Save,
  Trash2,
  ZoomIn,
} from 'lucide-react'
import { toast } from 'sonner'
import { useFormatter, useLocale, useTranslations } from 'next-intl'

import { ROUTES, galleryGenerationPath } from '@/constants/routes'
import { isCjkLocale } from '@/i18n/routing'
import { Link } from '@/i18n/navigation'

import {
  decomposeImageAPI,
  downloadRemoteAsset,
  editImageAPI,
  toggleGenerationVisibility,
} from '@/lib/api-client'
import { getApiErrorMessage } from '@/lib/api-error-message'
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
import { ImageCompare } from '@/components/ui/image-compare'
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
    'upscale' | 'remove-background' | 'decompose' | null
  >(null)
  const [isPinned, setIsPinned] = useState(generation.isFeatured ?? false)
  const [isPinning, setIsPinning] = useState(false)
  const format = useFormatter()
  const locale = useLocale()
  const isDenseLocale = isCjkLocale(locale)
  const t = useTranslations('ImageDetail')
  const tCard = useTranslations('GalleryCard')
  const tCommon = useTranslations('Common')
  const tModels = useTranslations('Models')
  const tToasts = useTranslations('Toasts')
  const tErrors = useTranslations('Errors')
  const closeLabel = tCommon.has('close') ? tCommon('close') : t('close')

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
      const ext = generation.mimeType.split('/')[1] || 'png'
      const result = await downloadRemoteAsset(
        generation.url,
        `pixelvault-${generation.id.slice(0, 8)}.${ext}`,
      )

      if (!result.success) {
        toast.error(getApiErrorMessage(tErrors, result, t('downloadFailed')))
        window.open(generation.url, '_blank', 'noopener,noreferrer')
      }
    } finally {
      setIsDownloading(false)
    }
  }

  const handleEditDownload = async (
    action: 'upscale' | 'remove-background',
    fileName: string,
  ) => {
    setEditingAction(action)
    const result = await editImageAPI(action, generation.url)
    setEditingAction(null)

    if (!result.success || !result.data) {
      toast.error(getApiErrorMessage(tErrors, result, t('editFailed')))
      return
    }

    const downloadResult = await downloadRemoteAsset(
      result.data.imageUrl,
      fileName,
    )

    if (!downloadResult.success) {
      toast.error(
        getApiErrorMessage(tErrors, downloadResult, t('downloadFailed')),
      )
      window.open(result.data.imageUrl, '_blank', 'noopener,noreferrer')
      return
    }

    toast.success(t('editSuccess'))
  }

  const handleEditSave = async (action: 'upscale' | 'remove-background') => {
    setEditingAction(action)
    const result = await editImageAPI(action, generation.url, {
      persist: true,
      generationId: generation.id,
    })
    setEditingAction(null)

    if (!result.success || !result.data) {
      toast.error(getApiErrorMessage(tErrors, result, t('editFailed')))
      return
    }

    toast.success(t('editSavedToGallery'))
  }

  const handleDecomposeDownload = async () => {
    setEditingAction('decompose')
    const result = await decomposeImageAPI(generation.url)
    setEditingAction(null)

    if (!result.success || !result.data) {
      toast.error(getApiErrorMessage(tErrors, result, t('decomposeFailed')))
      return
    }

    const downloadResult = await downloadRemoteAsset(
      result.data.psdUrl,
      `pixelvault-${generation.id.slice(0, 8)}-layers.psd`,
    )

    if (!downloadResult.success) {
      toast.error(
        getApiErrorMessage(tErrors, downloadResult, t('downloadFailed')),
      )
      window.open(result.data.psdUrl, '_blank', 'noopener,noreferrer')
      return
    }

    toast.success(t('decomposeSuccess'))
  }

  const handleDecomposeSave = async () => {
    setEditingAction('decompose')
    const result = await decomposeImageAPI(generation.url, {
      persist: true,
      generationId: generation.id,
    })
    setEditingAction(null)

    if (!result.success || !result.data) {
      toast.error(getApiErrorMessage(tErrors, result, t('decomposeFailed')))
      return
    }

    toast.success(t('editSavedToGallery'))
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
        closeLabel={closeLabel}
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
          ) : generation.referenceImageUrl ? (
            <ImageCompare
              beforeSrc={generation.referenceImageUrl}
              afterSrc={generation.url}
              beforeLabel={t('referenceLabel')}
              afterLabel={t('generatedLabel')}
              className="max-h-[60svh]"
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
                  {isPinned && (
                    <span className="flex items-center gap-1.5 text-sm text-primary">
                      <Pin className="size-3" />
                      {tCard('featuredOn')}
                    </span>
                  )}
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
                rel="noopener noreferrer"
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
              <a
                href={generation.url}
                target="_blank"
                rel="noopener noreferrer"
              >
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
                try {
                  const url = `${window.location.origin}/${locale}${galleryGenerationPath(generation.id)}`
                  await navigator.clipboard.writeText(url)
                  setCopied('link')
                  setTimeout(() => setCopied(null), 2000)
                } catch {
                  toast.error(t('shareFailed'))
                }
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
                  onClick={() =>
                    void handleEditDownload(
                      'upscale',
                      `pixelvault-${generation.id.slice(0, 8)}-upscaled.png`,
                    )
                  }
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
                  onClick={() =>
                    void handleEditDownload(
                      'remove-background',
                      `pixelvault-${generation.id.slice(0, 8)}-nobg.png`,
                    )
                  }
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
                {/* Save edited to gallery */}
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  disabled={editingAction !== null}
                  onClick={() => void handleEditSave('upscale')}
                >
                  <Save className="size-3.5" />
                  {t('saveUpscaleToGallery')}
                </Button>
                {/* Layer decomposition (See-Through) */}
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  disabled={editingAction !== null}
                  onClick={() => void handleDecomposeDownload()}
                  title={t('decomposeDescription')}
                >
                  {editingAction === 'decompose' ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Layers className="size-3.5" />
                  )}
                  {editingAction === 'decompose'
                    ? t('decomposing')
                    : t('decompose')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  disabled={editingAction !== null}
                  onClick={() => void handleDecomposeSave()}
                >
                  <Save className="size-3.5" />
                  {t('saveDecomposeToGallery')}
                </Button>
              </>
            )}

            {showVisibility && (
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  'rounded-full',
                  isPinned &&
                    'border-primary/30 bg-primary/5 text-primary hover:bg-primary/10',
                )}
                disabled={isPinning}
                onClick={async () => {
                  setIsPinning(true)
                  const prev = isPinned
                  setIsPinned(!prev)
                  const result = await toggleGenerationVisibility(
                    generation.id,
                    'isFeatured',
                  )
                  if (!result.success) {
                    setIsPinned(prev)
                    const msg =
                      result.errorCode === 'MAX_FEATURED_EXCEEDED' ||
                      result.error === 'MAX_FEATURED_EXCEEDED'
                        ? tToasts('featuredLimitReached')
                        : getApiErrorMessage(
                            tErrors,
                            result,
                            tToasts('featuredFailed'),
                          )
                    toast.error(msg)
                  } else {
                    toast.success(
                      tToasts(!prev ? 'featuredAdded' : 'featuredRemoved'),
                    )
                  }
                  setIsPinning(false)
                }}
              >
                <Pin className={cn('size-3.5', isPinned && 'fill-current')} />
                {isPinned ? tCard('unpinAction') : tCard('pinAction')}
              </Button>
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
