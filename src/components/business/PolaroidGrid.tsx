'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ImageIcon } from '@/components/icons'

import { ROUTES } from '@/constants/routes'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Spinner } from '@/components/ui/spinner'
import { GalleryViewer } from '@/features/gallery'
import { PolaroidCard } from '@/components/business/PolaroidCard'
import { useIsMobile } from '@/hooks/use-mobile'
import type { CreatorProfileWithImages } from '@/types'

interface PolaroidGridProps {
  generations: CreatorProfileWithImages['generations']
  totalImages: number
  hasMore: boolean
  isLoadingMore: boolean
  onLoadMore: () => void
  onLike: (generationId: string) => void
  isOwnProfile?: boolean
  onPin?: (generationId: string) => void
  isEmpty: boolean
}

export function PolaroidGrid({
  generations,
  totalImages,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onLike,
  isOwnProfile,
  onPin,
  isEmpty,
}: PolaroidGridProps) {
  const t = useTranslations('CreatorProfile')
  // 手机点开 = 和素材、画廊同一个整屏看图（左右滑、往下拉关、赞与做同款在底部，
  // owner 2026-10-14）；电脑照旧拍立得放大层。
  const isPhone = useIsMobile()
  const [viewerId, setViewerId] = useState<string | null>(null)
  const viewing = isPhone
    ? (generations.find((generation) => generation.id === viewerId) ?? null)
    : null
  const images = useMemo(
    () => generations.filter((generation) => generation.outputType === 'IMAGE'),
    [generations],
  )

  if (isEmpty) {
    // ui-spec §9 空状态：柔白卡（图标格 + 标题 + 黑色主钮）；只有自己的主页给去出图的那颗。
    return (
      <div className="mx-auto max-w-content px-4 py-16 sm:px-6">
        <EmptyState
          icon={<ImageIcon />}
          title={t('noPublicImages')}
          description={t('noPublicImagesHint')}
          action={
            isOwnProfile ? (
              <Button asChild size="sm" className="rounded-full coarse:h-11">
                <Link href={ROUTES.STUDIO}>{t('startCreating')}</Link>
              </Button>
            ) : undefined
          }
        />
      </div>
    )
  }

  return (
    <div className="max-w-content mx-auto px-4 sm:px-6">
      {/* Polaroid scatter grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6 sm:gap-8 py-8 sm:py-10">
        {generations.map((gen) => (
          <PolaroidCard
            key={gen.id}
            id={gen.id}
            url={gen.url}
            outputType={gen.outputType}
            prompt={gen.prompt}
            model={gen.model}
            createdAt={gen.createdAt}
            width={gen.width}
            height={gen.height}
            likeCount={gen.likeCount}
            isLiked={gen.isLiked}
            isFeatured={gen.isFeatured}
            isPromptPublic={gen.isPromptPublic}
            totalImages={totalImages}
            isOwnProfile={isOwnProfile}
            onLike={onLike}
            onPin={onPin}
            onOpen={isPhone ? setViewerId : undefined}
          />
        ))}
      </div>

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center pb-10">
          <Button
            variant="secondary"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="rounded-full border-border/60 hover:border-primary/25 hover:bg-primary/5"
          >
            {isLoadingMore ? (
              <>
                <Spinner size="md" />
                {t('loading')}
              </>
            ) : (
              t('loadMore')
            )}
          </Button>
        </div>
      )}

      {viewing ? (
        <GalleryViewer
          phone
          generation={viewing}
          images={images}
          onNavigate={(next) => setViewerId(next.id)}
          onClose={() => setViewerId(null)}
          onToggleLike={(generation) => onLike(generation.id)}
          pin={
            isOwnProfile && onPin
              ? {
                  pinned: viewing.isFeatured,
                  onToggle: () => onPin(viewing.id),
                }
              : undefined
          }
        />
      ) : null}
    </div>
  )
}
