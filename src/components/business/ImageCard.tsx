'use client'

import { memo, useCallback, useState } from 'react'
import Image from 'next/image'

import {
  ArrowUpRight,
  Coins,
  Download,
  Globe2,
  Heart,
  ImageIcon,
  LockKeyhole,
  Pin,
  Play,
} from 'lucide-react'
import { toast } from 'sonner'
import { useFormatter, useLocale, useTranslations } from 'next-intl'

import { isCjkLocale } from '@/i18n/routing'
import { Link } from '@/i18n/navigation'
import { creatorProfilePath } from '@/constants/routes'

import type { GenerationRecord } from '@/types'
import { ImageDetailModal } from '@/components/business/ImageDetailModal'
import { MetadataList } from '@/components/ui/metadata-list'
import { useGenerationVisibility } from '@/hooks/use-generation-visibility'
import { useLike } from '@/hooks/use-like'
import { downloadRemoteAsset } from '@/lib/api-client'
import { getApiErrorMessage } from '@/lib/api-error-message'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { cn, getLabelClassName } from '@/lib/utils'

interface ImageCardProps {
  generation: GenerationRecord
  showVisibility?: boolean
  showDelete?: boolean
  onDelete?: (id: string) => void
}

export const ImageCard = memo(function ImageCard({
  generation,
  showVisibility = false,
  showDelete = false,
  onDelete,
}: ImageCardProps) {
  const { isPublic, isPromptPublic, isFeatured, togglingField, handleToggle } =
    useGenerationVisibility({
      generationId: generation.id,
      initialIsPublic: generation.isPublic,
      initialIsPromptPublic: generation.isPromptPublic,
      initialIsFeatured: generation.isFeatured,
    })
  const [detailOpen, setDetailOpen] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [liked, setLiked] = useState(generation.isLiked ?? false)
  const [likeCount, setLikeCount] = useState(generation.likeCount ?? 0)
  const format = useFormatter()
  const locale = useLocale()
  const isDenseLocale = isCjkLocale(locale)
  const t = useTranslations('GalleryCard')
  const tCommon = useTranslations('Common')
  const tModels = useTranslations('Models')
  const tErrors = useTranslations('Errors')

  const { toggle: toggleLike, isPending: isLikePending } = useLike(
    useCallback((_id: string, newLiked: boolean, newCount: number) => {
      setLiked(newLiked)
      setLikeCount(newCount)
    }, []),
  )

  const handleLike = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      // Optimistic update
      setLiked((prev) => !prev)
      setLikeCount((prev) => (liked ? Math.max(prev - 1, 0) : prev + 1))
      void toggleLike(generation.id)
    },
    [generation.id, liked, toggleLike],
  )

  const handleDownload = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
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
    },
    [generation, isDownloading, t, tErrors],
  )

  const isVideo =
    generation.outputType === 'VIDEO' || generation.url.endsWith('.mp4')
  const createdAt = new Date(generation.createdAt)
  const modelLabel = getTranslatedModelLabel(tModels, generation.model)
  const aspectRatio = `${Math.max(generation.width, 1)} / ${Math.max(
    generation.height,
    1,
  )}`

  const metadata = [
    {
      label: t('modelLabel'),
      value: modelLabel,
      key: 'model',
    },
    {
      label: t('providerLabel'),
      value: generation.provider,
      key: 'provider',
    },
    {
      label: t('requestsLabel'),
      value: tCommon('creditCount', { count: generation.requestCount }),
      key: 'requests',
      icon: <Coins className="size-3 text-primary" />,
    },
  ]

  const labelClass = getLabelClassName(isDenseLocale)

  const detailGeneration = {
    ...generation,
    isPublic,
    isPromptPublic,
    isFeatured,
  }

  return (
    <>
      <article className="group overflow-hidden rounded-3xl border border-border/60 bg-card/84 shadow-sm transition-all duration-300 hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1">
        <div className="relative overflow-hidden bg-secondary/18">
          <button
            type="button"
            className="block w-full cursor-pointer"
            onClick={() => setDetailOpen(true)}
            aria-label={isVideo ? t('openVideo') : t('openImage')}
          >
            {isVideo ? (
              <video
                src={`${generation.url}#t=0.1`}
                muted
                playsInline
                preload="metadata"
                className="h-auto w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                style={{ aspectRatio }}
              />
            ) : (
              <Image
                src={generation.url}
                alt={generation.prompt}
                width={generation.width}
                height={generation.height}
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                className="h-auto w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                unoptimized
              />
            )}
          </button>
          {generation.referenceImageUrl && (
            <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/50 px-2 py-1 text-xs text-white backdrop-blur-md">
              <ImageIcon className="size-3" />
              {t('referenceImageLabel')}
            </span>
          )}
          {isVideo && (
            <>
              <span className="absolute bottom-3 left-3 flex size-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md">
                <Play className="ml-0.5 size-3.5" fill="currentColor" />
              </span>
              {generation.duration != null && (
                <span className="absolute bottom-3 right-3 rounded-full bg-black/50 px-2 py-0.5 font-mono text-xs text-white backdrop-blur-md">
                  0:{String(Math.round(generation.duration)).padStart(2, '0')}
                </span>
              )}
            </>
          )}

          {/* Hover action buttons */}
          <div className="absolute right-3 top-3 flex gap-1.5 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <button
              type="button"
              onClick={handleLike}
              disabled={isLikePending}
              className="flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-xs text-white backdrop-blur-md transition-colors hover:bg-black/70 disabled:pointer-events-none"
              aria-label={liked ? t('unlike') : t('like')}
            >
              <Heart
                className={cn(
                  'size-3.5 transition-colors',
                  liked && 'fill-red-500 text-red-500',
                )}
              />
              {likeCount > 0 && <span>{likeCount}</span>}
            </button>
            <button
              type="button"
              onClick={(e) => void handleDownload(e)}
              disabled={isDownloading}
              className="flex items-center rounded-full bg-black/50 p-1.5 text-white backdrop-blur-md transition-colors hover:bg-black/70 disabled:pointer-events-none"
              aria-label={t('download')}
            >
              <Download
                className={cn('size-3.5', isDownloading && 'animate-pulse')}
              />
            </button>
          </div>
        </div>

        <div className="space-y-4 p-4 sm:p-5">
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

            <button
              type="button"
              onClick={() => setDetailOpen(true)}
              className={cn(
                'inline-flex shrink-0 items-center gap-1 text-nav font-semibold text-muted-foreground transition-colors hover:text-foreground',
                isDenseLocale
                  ? 'tracking-normal normal-case'
                  : 'uppercase tracking-nav-dense',
              )}
              aria-label={t('openImage')}
            >
              {t('openLabel')}
              <ArrowUpRight className="size-3.5" />
            </button>
          </div>

          {/* Creator attribution */}
          {generation.creator?.username && !showVisibility && (
            <Link
              href={creatorProfilePath(generation.creator.username)}
              className="flex items-center gap-2 group/creator"
            >
              {generation.creator.avatarUrl ? (
                <Image
                  src={generation.creator.avatarUrl}
                  alt={
                    generation.creator.displayName ??
                    generation.creator.username
                  }
                  width={20}
                  height={20}
                  className="size-5 rounded-full object-cover"
                />
              ) : (
                <span className="size-5 rounded-full bg-muted flex items-center justify-center text-3xs font-medium text-muted-foreground">
                  {(
                    generation.creator.displayName ??
                    generation.creator.username
                  )
                    .charAt(0)
                    .toUpperCase()}
                </span>
              )}
              <span className="text-xs text-muted-foreground group-hover/creator:text-foreground transition-colors truncate">
                {generation.creator.displayName ?? generation.creator.username}
              </span>
            </Link>
          )}

          {showVisibility || generation.isPromptPublic ? (
            <p className="line-clamp-3 font-serif text-base leading-6 text-foreground">
              {generation.prompt}
            </p>
          ) : !showVisibility && generation.isPublic ? (
            <p className="flex items-center gap-1.5 font-serif text-sm italic text-muted-foreground">
              <LockKeyhole className="size-3" />
              {t('promptPrivateHint')}
            </p>
          ) : null}

          <MetadataList items={metadata} labelClassName={labelClass} />

          {showVisibility ? (
            <dl className="grid gap-2">
              <div className="flex items-start justify-between gap-3 pt-0.5">
                <dt className={labelClass}>{t('imageVisibilityLabel')}</dt>
                <dd className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-sm text-foreground">
                    {isPublic ? (
                      <Globe2 className="size-3 text-chart-2" />
                    ) : (
                      <LockKeyhole className="size-3 text-muted-foreground" />
                    )}
                    {isPublic ? t('publicLabel') : t('privateLabel')}
                  </span>
                  <button
                    type="button"
                    disabled={togglingField !== null}
                    onClick={() => void handleToggle('isPublic')}
                    className={cn(
                      'text-nav font-semibold text-primary underline-offset-2 transition-opacity hover:underline disabled:pointer-events-none',
                      isDenseLocale
                        ? 'tracking-normal normal-case'
                        : 'uppercase tracking-nav-dense',
                      togglingField !== null && 'opacity-50',
                    )}
                  >
                    {isPublic ? t('makePrivateAction') : t('makePublicAction')}
                  </button>
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className={labelClass}>{t('promptVisibilityLabel')}</dt>
                <dd className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-sm text-foreground">
                    {isPromptPublic ? (
                      <Globe2 className="size-3 text-chart-2" />
                    ) : (
                      <LockKeyhole className="size-3 text-muted-foreground" />
                    )}
                    {isPromptPublic ? t('publicLabel') : t('privateLabel')}
                  </span>
                  <button
                    type="button"
                    disabled={togglingField !== null}
                    onClick={() => void handleToggle('isPromptPublic')}
                    className={cn(
                      'text-nav font-semibold text-primary underline-offset-2 transition-opacity hover:underline disabled:pointer-events-none',
                      isDenseLocale
                        ? 'tracking-normal normal-case'
                        : 'uppercase tracking-nav-dense',
                      togglingField !== null && 'opacity-50',
                    )}
                  >
                    {isPromptPublic
                      ? t('makePrivateAction')
                      : t('makePublicAction')}
                  </button>
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className={labelClass}>{t('featuredLabel')}</dt>
                <dd className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-sm text-foreground">
                    <Pin
                      className={cn(
                        'size-3',
                        isFeatured ? 'text-primary' : 'text-muted-foreground',
                      )}
                    />
                    {isFeatured ? t('featuredOn') : t('featuredOff')}
                  </span>
                  <button
                    type="button"
                    disabled={togglingField !== null}
                    onClick={() => void handleToggle('isFeatured')}
                    className={cn(
                      'text-nav font-semibold text-primary underline-offset-2 transition-opacity hover:underline disabled:pointer-events-none',
                      isDenseLocale
                        ? 'tracking-normal normal-case'
                        : 'uppercase tracking-nav-dense',
                      togglingField !== null && 'opacity-50',
                    )}
                  >
                    {isFeatured ? t('unpinAction') : t('pinAction')}
                  </button>
                </dd>
              </div>
            </dl>
          ) : null}
        </div>
      </article>

      <ImageDetailModal
        generation={detailGeneration}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        showVisibility={showVisibility}
        showDelete={showDelete}
        onDelete={onDelete}
      />
    </>
  )
})
