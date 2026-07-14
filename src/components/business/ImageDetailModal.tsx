'use client'
/* eslint-disable @next/next/no-img-element */

import { useState } from 'react'

import {
  ArrowUpRight,
  Check,
  Coins,
  Copy,
  Download,
  Globe2,
  ImageIcon,
  Link2,
  LockKeyhole,
  Pin,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { useAuth } from '@clerk/nextjs'

import {
  galleryGenerationPath,
  promptCreatePath,
  studioCanvasEditPath,
} from '@/constants/routes'
import { isCjkLocale } from '@/i18n/routing'
import { Link } from '@/i18n/navigation'

import {
  downloadRemoteAsset,
  toggleGenerationVisibility,
} from '@/lib/api-client'
import { getApiErrorMessage } from '@/lib/api-error-message'
import type { GenerationRecord } from '@/types'
import { getGenerationPreviewUrl } from '@/lib/generation-media'
import VideoPlayer from '@/components/business/VideoPlayer'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { MetadataList } from '@/components/ui/metadata-list'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { cn, getLabelClassName } from '@/lib/utils'
import {
  MediaDetailViewer,
  type MediaTransitionOrigin,
} from '@/components/business/MediaDetailViewer'

interface ImageDetailModalProps {
  generation: GenerationRecord
  open: boolean
  onOpenChange: (open: boolean) => void
  showVisibility?: boolean
  showDelete?: boolean
  onDelete?: (id: string) => void
  transitionOrigin?: MediaTransitionOrigin | null
}

function triggerDirectAssetDownload(url: string, fileName: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

function openExternalAsset(url: string) {
  const openedWindow = window.open(url, '_blank')
  if (openedWindow) {
    openedWindow.opener = null
    return
  }

  window.location.assign(url)
}

export function ImageDetailModal({
  generation,
  open,
  onOpenChange,
  showVisibility = false,
  showDelete = false,
  onDelete,
  transitionOrigin,
}: ImageDetailModalProps) {
  const [isDownloading, setIsDownloading] = useState(false)
  const [copied, setCopied] = useState<'prompt' | 'link' | null>(null)
  const [isPinned, setIsPinned] = useState(generation.isFeatured ?? false)
  const [isPinning, setIsPinning] = useState(false)
  const [referencePreviewOpen, setReferencePreviewOpen] = useState(false)
  const format = useFormatter()
  const locale = useLocale()
  const { isSignedIn } = useAuth()
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
  const previewUrl = getGenerationPreviewUrl(generation)
  const creatorName =
    generation.creator?.displayName?.trim() ||
    generation.creator?.username?.trim() ||
    ''
  const creatorHandle = generation.creator?.username
    ? `@${generation.creator.username}`
    : ''
  const creatorInitial = creatorName.charAt(0).toUpperCase()

  const aspectRatio = `${Math.max(generation.width, 1)} / ${Math.max(
    generation.height,
    1,
  )}`

  const handleDownload = async () => {
    if (isDownloading) return
    const ext = generation.mimeType.split('/')[1] || 'png'
    const fileName = `pixelvault-${generation.id.slice(0, 8)}.${ext}`

    if (!isSignedIn) {
      triggerDirectAssetDownload(generation.url, fileName)
      return
    }

    setIsDownloading(true)
    try {
      const result = await downloadRemoteAsset(generation.url, fileName)

      if (!result.success) {
        toast.error(getApiErrorMessage(tErrors, result, t('downloadFailed')))
        triggerDirectAssetDownload(generation.url, fileName)
      }
    } finally {
      setIsDownloading(false)
    }
  }

  const handleOpenOriginal = () => {
    openExternalAsset(generation.url)
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
      value: tCommon('requestCount', { count: generation.requestCount }),
      key: 'requests',
      icon: <Coins className="size-3 text-primary" />,
    },
    {
      label: t('dimensionsLabel'),
      value: `${generation.width} \u00d7 ${generation.height}`,
      key: 'dimensions',
    },
  ]

  const media = (
    <div className="relative z-10 flex max-h-full max-w-full items-center justify-center">
      {generation.outputType === 'VIDEO' ? (
        <VideoPlayer
          src={generation.url}
          width={generation.width}
          height={generation.height}
          className="max-h-[calc(48dvh-4rem)] max-w-full rounded-2xl border border-border/60 bg-black/40 lg:max-h-[calc(100dvh-8rem)]"
        />
      ) : (
        <img
          src={previewUrl}
          alt={generation.prompt}
          className="h-auto max-h-[calc(48dvh-4rem)] max-w-full rounded-2xl object-contain shadow-sm lg:max-h-[calc(100dvh-8rem)]"
          style={{ aspectRatio }}
        />
      )}
    </div>
  )

  const toolbarActions = (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        className="rounded-full text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        onClick={() => void handleDownload()}
        disabled={isDownloading}
        aria-label={isDownloading ? t('downloading') : t('download')}
      >
        <Download className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="rounded-full text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        onClick={handleOpenOriginal}
        aria-label={t('openOriginal')}
      >
        <ArrowUpRight className="size-4" />
      </Button>
    </>
  )

  const sideHeader = (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        {generation.creator?.username ? (
          <div className="flex min-w-0 items-center gap-3">
            {generation.creator.avatarUrl ? (
              <img
                src={generation.creator.avatarUrl}
                alt={creatorName}
                className="size-9 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground">
                {creatorInitial}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {creatorName}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {creatorHandle}
              </p>
            </div>
          </div>
        ) : (
          <p className="truncate text-sm font-medium text-foreground">
            {t('title')}
          </p>
        )}
        <span className="shrink-0 rounded-full border border-border/70 bg-muted/30 px-2.5 py-1 text-xs text-muted-foreground">
          {format.dateTime(createdAt, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
      </div>

      {showVisibility ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/30 px-2.5 py-1">
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
          <span className="flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/30 px-2.5 py-1">
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
            <span className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-primary">
              <Pin className="size-3" />
              {tCard('featuredOn')}
            </span>
          )}
        </div>
      ) : null}
    </div>
  )

  const sideContent = (
    <div className="space-y-5">
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
          <button
            type="button"
            aria-label={t('referenceImageLabel')}
            onClick={() => setReferencePreviewOpen(true)}
            className="group/reference relative block w-fit overflow-hidden rounded-xl border border-border/70 text-left transition-colors hover:border-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <img
              src={generation.referenceImageUrl}
              alt={t('referenceImageLabel')}
              className="h-auto max-h-40 object-contain transition-transform duration-200 group-hover/reference:scale-[1.015]"
            />
            <span className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-background/85 text-foreground opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover/reference:opacity-100 group-focus-visible/reference:opacity-100">
              <ArrowUpRight className="size-3.5" />
            </span>
          </button>
        </div>
      ) : null}

      <MetadataList items={metadata} labelClassName={labelClass} />
    </div>
  )

  const footerActions = (
    <div className="flex flex-wrap gap-2">
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
        <Button variant="outline" size="sm" className="rounded-full" asChild>
          <Link
            href={promptCreatePath({
              prompt: generation.prompt,
              negativePrompt: generation.negativePrompt,
              modelId: generation.model,
              provider: generation.provider,
              outputType: generation.outputType,
              generationId: generation.id,
            })}
          >
            <Sparkles className="size-3.5" />
            {t('savePromptTemplate')}
          </Link>
        </Button>
      )}

      {generation.outputType === 'IMAGE' && (
        <Button variant="outline" size="sm" className="rounded-full" asChild>
          <Link
            href={studioCanvasEditPath({
              generationId: generation.id,
              sourceUrl: generation.url,
              width: generation.width,
              height: generation.height,
            })}
          >
            <Wand2 className="size-3.5" />
            {t('editInStudio')}
          </Link>
        </Button>
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
  )

  const referenceOverlay =
    referencePreviewOpen && generation.referenceImageUrl ? (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('referenceImageLabel')}
        className="fixed inset-0 z-[90] flex h-dvh w-full items-center justify-center bg-background/95 p-4 backdrop-blur-sm"
        onClick={() => setReferencePreviewOpen(false)}
      >
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={closeLabel}
          className="absolute right-4 top-4 size-10 rounded-full border-border/70 bg-background/88 shadow-sm backdrop-blur-xl hover:bg-muted/70"
          onClick={() => setReferencePreviewOpen(false)}
        >
          <X className="size-4" />
        </Button>
        <img
          src={generation.referenceImageUrl}
          alt={t('referenceImageLabel')}
          className="max-h-[calc(100dvh-5rem)] max-w-full rounded-2xl object-contain shadow-sm"
          onClick={(event) => event.stopPropagation()}
        />
      </div>
    ) : null

  return (
    <>
      <MediaDetailViewer
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setReferencePreviewOpen(false)
          onOpenChange(nextOpen)
        }}
        title={t('title')}
        description={
          showVisibility || generation.isPromptPublic
            ? generation.prompt
            : t('title')
        }
        closeLabel={closeLabel}
        media={media}
        sideHeader={sideHeader}
        sideContent={sideContent}
        footerActions={footerActions}
        toolbarActions={toolbarActions}
        overlayContent={referenceOverlay}
        transitionOrigin={transitionOrigin}
        transitionImageSrc={previewUrl}
        transitionImageAlt={generation.prompt}
      />
    </>
  )
}
