'use client'

import { memo, useCallback, useState } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { creatorProfilePath } from '@/constants/routes'
import type { GenerationRecord } from '@/types'
import { ImageCardActions } from '@/components/business/image-card/ImageCardActions'
import { ImageCardMedia } from '@/components/business/image-card/ImageCardMedia'
import type { MediaTransitionOrigin } from '@/components/business/MediaDetailViewer'
import { downloadRemoteAsset } from '@/lib/api-client'
import { getApiErrorMessage } from '@/lib/api-error-message'

// 平板 / 手机才用得到的全屏详情：500+ 行、带播放器与对比组件，只在第一次点开时再加载。
const ImageDetailModal = dynamic(
  () =>
    import('@/components/business/ImageDetailModal').then(
      (m) => m.ImageDetailModal,
    ),
  { ssr: false },
)

interface ImageCardProps {
  generation: GenerationRecord
  priority?: boolean
  /**
   * 桌面：点开交给画廊的就地查看器（宿主持有那一张）。不给 = 平板 / 手机：这张卡
   * 自己开全屏详情（domains/gallery.md「卡片、顶栏与详情」）。
   */
  onOpen?: (generation: GenerationRecord) => void
  /** ♥ 由画廊统一记（卡片与查看器看同一个数）。 */
  onToggleLike: (generation: GenerationRecord) => void
}

/**
 * 画廊卡（卡片与详情 A）：皮照 LoRA 库 —— 圆角、没有描边，先铺浅灰再由糊变清；
 * 静态卡面只有媒体与角标，悬停 / 键盘进到这一格才出左下作者小签与右上 ♥ · 下载。
 * 提示词、复制、进 Studio 都在查看器里，⛔ 卡面不再压底部大黑条。
 */
export const ImageCard = memo(function ImageCard({
  generation,
  priority,
  onOpen,
  onToggleLike,
}: ImageCardProps) {
  const t = useTranslations('GalleryCard')
  const tErrors = useTranslations('Errors')
  const locale = useLocale()
  const [detailOpen, setDetailOpen] = useState(false)
  // 全屏详情第一次点开才挂（配合上面的动态加载），没点过的卡不跑它的 hook 树。
  const [hasOpenedDetail, setHasOpenedDetail] = useState(false)
  const [detailOrigin, setDetailOrigin] =
    useState<MediaTransitionOrigin | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)

  const openDetail = useCallback(
    (origin: MediaTransitionOrigin | null) => {
      if (onOpen) {
        onOpen(generation)
        return
      }
      setDetailOrigin(origin)
      setHasOpenedDetail(true)
      setDetailOpen(true)
    },
    [generation, onOpen],
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
  const aspectRatio = `${Math.max(generation.width, 1)} / ${Math.max(
    generation.height,
    1,
  )}`
  const creator = generation.creator
  const creatorName =
    creator?.displayName?.trim() || creator?.username?.trim() || ''
  const creatorPath = creator?.username
    ? creatorProfilePath(creator.username)
    : ''
  const creatorHref = creatorPath ? `/${locale}${creatorPath}` : ''
  const creatorInitial = creatorName.charAt(0).toUpperCase()

  return (
    <>
      <article
        data-gallery-tile-id={generation.id}
        className="group relative overflow-hidden rounded-xl bg-muted transition-shadow duration-fast ease-linear hover:shadow-float has-focus-visible:shadow-float"
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
          layerBadgeLabel={
            generation.layers?.length
              ? t('layerBadge', { count: generation.layers.length })
              : undefined
          }
        />
        <ImageCardActions
          liked={Boolean(generation.isLiked)}
          likeCount={generation.likeCount ?? 0}
          isLikePending={false}
          isDownloading={isDownloading}
          onLike={(e) => {
            e.stopPropagation()
            onToggleLike(generation)
          }}
          onDownload={(e) => void handleDownload(e)}
          likeLabel={t('like')}
          unlikeLabel={t('unlike')}
          downloadLabel={t('download')}
          hiddenOnCoarse
        />
        {creator?.username ? (
          // 左下作者小签：悬停 / 键盘进到这一格才出，点它去主页；触屏不渲染。
          <a
            href={creatorHref}
            onClick={(e) => e.stopPropagation()}
            aria-label={t('creatorProfileLabel', { name: creatorName })}
            className="pointer-events-none absolute bottom-2.5 left-2.5 z-10 inline-flex h-7 max-w-48 items-center gap-1.5 rounded-full bg-black/55 pl-1 pr-2.5 text-xs font-semibold text-white opacity-0 backdrop-blur-md transition-opacity duration-fast ease-linear group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 coarse:hidden"
          >
            {creator.avatarUrl ? (
              <Image
                src={creator.avatarUrl}
                alt=""
                width={20}
                height={20}
                unoptimized
                className="size-5 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white/20 text-3xs"
              >
                {creatorInitial}
              </span>
            )}
            <span className="min-w-0 truncate">{creatorName}</span>
          </a>
        ) : null}
      </article>

      {!onOpen && hasOpenedDetail ? (
        <ImageDetailModal
          generation={generation}
          open={detailOpen}
          onOpenChange={setDetailOpen}
          transitionOrigin={detailOrigin}
        />
      ) : null}
    </>
  )
})
