'use client'

import { useTranslations } from 'next-intl'
import { Loader2, ImageIcon } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { PolaroidCard } from '@/components/business/PolaroidCard'
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

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="size-16 rounded-full bg-primary/5 flex items-center justify-center mb-5">
          <ImageIcon className="size-7 text-primary/40" />
        </div>
        <p className="text-muted-foreground font-serif text-lg">
          {t('noPublicImages')}
        </p>
        <Link href="/studio" className="mt-5">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full border-border/60 hover:border-primary/25 hover:bg-primary/5"
          >
            {t('startCreating')}
          </Button>
        </Link>
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
          />
        ))}
      </div>

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center pb-10">
          <Button
            variant="outline"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="rounded-full border-border/60 hover:border-primary/25 hover:bg-primary/5"
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t('loading')}
              </>
            ) : (
              t('loadMore')
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
