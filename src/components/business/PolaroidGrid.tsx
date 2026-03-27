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
  isEmpty: boolean
}

export function PolaroidGrid({
  generations,
  totalImages,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onLike,
  isEmpty,
}: PolaroidGridProps) {
  const t = useTranslations('CreatorProfile')

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ImageIcon className="size-12 text-muted-foreground/40 mb-4" />
        <p className="text-muted-foreground font-serif text-lg">
          {t('noPublicImages')}
        </p>
        <Link href="/studio" className="mt-4">
          <Button variant="outline" size="sm">
            {t('startCreating')}
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Polaroid scatter grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8 px-4 py-6">
        {generations.map((gen) => (
          <PolaroidCard
            key={gen.id}
            id={gen.id}
            url={gen.url}
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
            onLike={onLike}
          />
        ))}
      </div>

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center pb-8">
          <Button
            variant="outline"
            onClick={onLoadMore}
            disabled={isLoadingMore}
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
