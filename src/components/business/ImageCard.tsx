'use client'

import { memo, useCallback, useState } from 'react'
import Image from 'next/image'

import { ImageCardMedia } from '@/components/business/image-card/ImageCardMedia'
import { ImageCardActions } from '@/components/business/image-card/ImageCardActions'
import { ImageCardVisibility } from '@/components/business/image-card/ImageCardVisibility'

import { ArrowUpRight, Coins, LockKeyhole } from 'lucide-react'
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

  const isAudio =
    generation.outputType === 'AUDIO' ||
    generation.url.endsWith('.mp3') ||
    generation.url.endsWith('.wav')
  const isVideo =
    !isAudio &&
    (generation.outputType === 'VIDEO' || generation.url.endsWith('.mp4'))
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
          <ImageCardMedia
            generation={generation}
            isAudio={isAudio}
            isVideo={isVideo}
            aspectRatio={aspectRatio}
            onOpenDetail={() => setDetailOpen(true)}
            openImageLabel={t('openImage')}
            openVideoLabel={t('openVideo')}
            referenceImageLabel={t('referenceImageLabel')}
          />
          <ImageCardActions
            liked={liked}
            likeCount={likeCount}
            isLikePending={isLikePending}
            isDownloading={isDownloading}
            onLike={handleLike}
            onDownload={(e) => void handleDownload(e)}
            likeLabel={t('like')}
            unlikeLabel={t('unlike')}
            downloadLabel={t('download')}
          />
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
            <ImageCardVisibility
              isPublic={isPublic}
              isPromptPublic={isPromptPublic}
              isFeatured={isFeatured}
              togglingField={togglingField}
              onToggle={handleToggle}
              labelClass={labelClass}
              isDenseLocale={isDenseLocale}
              labels={{
                imageVisibilityLabel: t('imageVisibilityLabel'),
                promptVisibilityLabel: t('promptVisibilityLabel'),
                featuredLabel: t('featuredLabel'),
                publicLabel: t('publicLabel'),
                privateLabel: t('privateLabel'),
                makePublicAction: t('makePublicAction'),
                makePrivateAction: t('makePrivateAction'),
                featuredOn: t('featuredOn'),
                featuredOff: t('featuredOff'),
                pinAction: t('pinAction'),
                unpinAction: t('unpinAction'),
              }}
            />
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
