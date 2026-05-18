'use client'

import { memo, useCallback, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'

import { ImageCardMedia } from '@/components/business/image-card/ImageCardMedia'
import { ImageCardActions } from '@/components/business/image-card/ImageCardActions'
import { ImageCardVisibility } from '@/components/business/image-card/ImageCardVisibility'

import { ArrowUpRight, Coins, Copy, LockKeyhole, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { useFormatter, useLocale, useTranslations } from 'next-intl'

import { isCjkLocale } from '@/i18n/routing'
import { useRouter } from '@/i18n/navigation'
import { ROUTES, creatorProfilePath } from '@/constants/routes'
import { STUDIO_PREFILL_PROMPT_STORAGE_KEY } from '@/constants/studio'

import type { GenerationRecord, OutputType } from '@/types'
// Modal weighs 500+ lines and pulls VideoPlayer, ImageCompare, image-editing
// hook etc. Each gallery page renders dozens of ImageCards — eagerly bundling
// the modal multiplies the cost. We only need it on first detail open.
const ImageDetailModal = dynamic(
  () =>
    import('@/components/business/ImageDetailModal').then(
      (m) => m.ImageDetailModal,
    ),
  { ssr: false },
)
import { MetadataList } from '@/components/ui/metadata-list'
import { useGenerationVisibility } from '@/hooks/use-generation-visibility'
import { useLike } from '@/hooks/use-like'
import { downloadRemoteAsset } from '@/lib/api-client'
import { getApiErrorMessage } from '@/lib/api-error-message'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { cn, getLabelClassName } from '@/lib/utils'

export const IMAGE_CARD_PRESENTATIONS = {
  DEFAULT: 'default',
  GALLERY: 'gallery',
} as const

type ImageCardPresentation =
  (typeof IMAGE_CARD_PRESENTATIONS)[keyof typeof IMAGE_CARD_PRESENTATIONS]

function getStudioRouteForOutputType(outputType: OutputType) {
  if (outputType === 'VIDEO') return ROUTES.STUDIO_VIDEO
  if (outputType === 'AUDIO') return ROUTES.STUDIO_AUDIO
  return ROUTES.STUDIO_IMAGE
}

interface ImageCardProps {
  generation: GenerationRecord
  showVisibility?: boolean
  showDelete?: boolean
  onDelete?: (id: string) => void
  priority?: boolean
  presentation?: ImageCardPresentation
}

export const ImageCard = memo(function ImageCard({
  generation,
  showVisibility = false,
  showDelete = false,
  onDelete,
  priority,
  presentation = IMAGE_CARD_PRESENTATIONS.DEFAULT,
}: ImageCardProps) {
  const { isPublic, isPromptPublic, isFeatured, togglingField, handleToggle } =
    useGenerationVisibility({
      generationId: generation.id,
      initialIsPublic: generation.isPublic,
      initialIsPromptPublic: generation.isPromptPublic,
      initialIsFeatured: generation.isFeatured,
    })
  const [detailOpen, setDetailOpen] = useState(false)
  // Modal mounts on first open and stays mounted thereafter — pairs with the
  // dynamic import above so neither the chunk nor the modal's hook tree
  // (useImageEditing etc.) runs for cards the user never opens.
  const [hasOpenedDetail, setHasOpenedDetail] = useState(false)
  const openDetail = useCallback(() => {
    setHasOpenedDetail(true)
    setDetailOpen(true)
  }, [])
  const [isDownloading, setIsDownloading] = useState(false)
  const [liked, setLiked] = useState(generation.isLiked ?? false)
  const [likeCount, setLikeCount] = useState(generation.likeCount ?? 0)
  const likeRequestRef = useRef(false)
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
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      if (likeRequestRef.current) return
      likeRequestRef.current = true

      const previousLiked = liked
      const previousCount = likeCount
      setLiked(!previousLiked)
      setLikeCount(
        previousLiked ? Math.max(previousCount - 1, 0) : previousCount + 1,
      )

      try {
        const committed = await toggleLike(generation.id)
        if (!committed) {
          setLiked(previousLiked)
          setLikeCount(previousCount)
        }
      } catch {
        setLiked(previousLiked)
        setLikeCount(previousCount)
      } finally {
        likeRequestRef.current = false
      }
    },
    [generation.id, likeCount, liked, toggleLike],
  )

  const router = useRouter()
  const promptText = generation.prompt ?? ''
  const canShowPromptOverlay = Boolean(promptText) && generation.isPromptPublic

  const handleCopyPrompt = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!promptText) return
      try {
        await navigator.clipboard.writeText(promptText)
        toast.success(t('promptCopiedToast'))
      } catch {
        toast.error(t('downloadFailed'))
      }
    },
    [promptText, t],
  )

  const handleUseInStudio = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!promptText) return
      try {
        sessionStorage.setItem(STUDIO_PREFILL_PROMPT_STORAGE_KEY, promptText)
      } catch {
        // best-effort — non-blocking
      }
      router.push(getStudioRouteForOutputType(generation.outputType))
    },
    [promptText, router, generation.outputType],
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
      value: tCommon('requestCount', { count: generation.requestCount }),
      key: 'requests',
      icon: <Coins className="size-3 text-primary" />,
    },
  ]

  const labelClass = getLabelClassName(isDenseLocale)
  const isGalleryPresentation =
    presentation === IMAGE_CARD_PRESENTATIONS.GALLERY && !showVisibility
  const creator = generation.creator
  const creatorName =
    creator?.displayName?.trim() || creator?.username?.trim() || ''
  const creatorPath = creator?.username
    ? creatorProfilePath(creator.username)
    : ''
  const creatorHref = creatorPath ? `/${locale}${creatorPath}` : ''
  const creatorHandle = creator?.username ? `@${creator.username}` : ''
  const showCreatorHandle =
    Boolean(creator?.displayName?.trim()) &&
    creator?.displayName?.trim() !== creator?.username
  const creatorInitial = creatorName.charAt(0).toUpperCase()

  const detailGeneration = {
    ...generation,
    isPublic,
    isPromptPublic,
    isFeatured,
  }

  return (
    <>
      <article
        className={cn(
          'group overflow-hidden border',
          isGalleryPresentation
            ? 'rounded-xl border-border/25 bg-transparent transition-colors duration-200 hover:border-border/70'
            : 'rounded-3xl border-border/60 bg-card/84 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/20 hover:shadow-md hover:shadow-primary/5',
        )}
      >
        <div
          className={cn(
            'relative overflow-hidden',
            isGalleryPresentation
              ? 'rounded-xl bg-secondary/12'
              : 'bg-secondary/18',
          )}
        >
          <ImageCardMedia
            priority={priority}
            generation={generation}
            isAudio={isAudio}
            isVideo={isVideo}
            aspectRatio={aspectRatio}
            onOpenDetail={openDetail}
            openImageLabel={t('openImage')}
            openVideoLabel={t('openVideo')}
            referenceImageLabel={t('referenceImageLabel')}
          />
          <ImageCardActions
            liked={liked}
            likeCount={likeCount}
            isLikePending={isLikePending}
            isDownloading={isDownloading}
            onLike={(e) => void handleLike(e)}
            onDownload={(e) => void handleDownload(e)}
            likeLabel={t('like')}
            unlikeLabel={t('unlike')}
            downloadLabel={t('download')}
          />
          {isGalleryPresentation && creator?.username ? (
            <div
              className={cn(
                'pointer-events-none absolute left-2.5 right-2.5 z-10 flex justify-start transition-opacity duration-200',
                isVideo ? 'bottom-12' : isAudio ? 'top-2.5' : 'bottom-2.5',
                // Fade the creator pill out on hover so the prompt/action overlay
                // owns the bottom of the card without colliding.
                isGalleryPresentation && 'group-hover:opacity-0',
              )}
            >
              <a
                href={creatorHref}
                aria-label={t('creatorProfileLabel', { name: creatorName })}
                className="pointer-events-auto inline-flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-black/50 px-2.5 py-1.5 text-white shadow-sm backdrop-blur-md transition-colors hover:bg-black/70 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
              >
                {creator.avatarUrl ? (
                  <Image
                    src={creator.avatarUrl}
                    alt=""
                    width={24}
                    height={24}
                    unoptimized
                    className="size-6 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/20 text-[10px] font-semibold"
                  >
                    {creatorInitial}
                  </span>
                )}
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-xs font-semibold">
                    {creatorName}
                  </span>
                  {showCreatorHandle ? (
                    <span className="block truncate text-[10px] text-white/70">
                      {creatorHandle}
                    </span>
                  ) : null}
                </span>
              </a>
            </div>
          ) : null}

          {isGalleryPresentation ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 translate-y-2 opacity-0 transition-all duration-200 ease-out group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
              <div className="pointer-events-auto flex flex-col gap-2.5 bg-gradient-to-t from-black/90 via-black/70 to-transparent px-3 pb-3 pt-10 text-white">
                {canShowPromptOverlay ? (
                  <p className="line-clamp-3 text-xs leading-snug text-white/95">
                    {promptText}
                  </p>
                ) : promptText ? (
                  <p className="flex items-center gap-1.5 text-xs italic text-white/65">
                    <LockKeyhole className="size-3" />
                    {t('promptPrivateHint')}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex max-w-[55%] items-center truncate rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-medium tracking-wide text-white/90 backdrop-blur-md">
                    {modelLabel}
                  </span>
                  <div className="ml-auto flex items-center gap-1.5">
                    {canShowPromptOverlay ? (
                      <button
                        type="button"
                        onClick={(e) => void handleCopyPrompt(e)}
                        className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-md transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
                        aria-label={t('copyPromptAction')}
                      >
                        <Copy className="size-3" />
                        {t('copyPromptAction')}
                      </button>
                    ) : null}
                    {canShowPromptOverlay ? (
                      <button
                        type="button"
                        onClick={handleUseInStudio}
                        className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-black transition-colors hover:bg-white/85 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
                        aria-label={t('useInStudioAction')}
                      >
                        <Wand2 className="size-3" />
                        {t('useInStudioAction')}
                        <ArrowUpRight className="size-3" />
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {isGalleryPresentation ? null : (
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
                onClick={openDetail}
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
            {creator?.username && !showVisibility && (
              <a
                href={creatorHref}
                className="flex items-center gap-2 group/creator"
              >
                {creator.avatarUrl ? (
                  <Image
                    src={creator.avatarUrl}
                    alt={creator.displayName ?? creator.username}
                    width={20}
                    height={20}
                    unoptimized
                    className="size-5 rounded-full object-cover"
                  />
                ) : (
                  <span className="size-5 rounded-full bg-muted flex items-center justify-center text-3xs font-medium text-muted-foreground">
                    {creatorName.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="text-xs text-muted-foreground group-hover/creator:text-foreground transition-colors truncate">
                  {creatorName}
                </span>
              </a>
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
        )}
      </article>

      {hasOpenedDetail && (
        <ImageDetailModal
          generation={detailGeneration}
          open={detailOpen}
          onOpenChange={setDetailOpen}
          showVisibility={showVisibility}
          showDelete={showDelete}
          onDelete={onDelete}
        />
      )}
    </>
  )
})
