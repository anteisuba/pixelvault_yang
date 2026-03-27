'use client'

import Image from 'next/image'
import { Loader2, ImageIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useCharacterCardGallery } from '@/hooks/use-character-card-gallery'
import { Button } from '@/components/ui/button'

interface CharacterCardGalleryProps {
  /** One or more card IDs — single shows that card's generations, multiple shows intersection */
  cardIds: string[]
  /** Card names for display in combination mode */
  cardNames?: string[]
}

export function CharacterCardGallery({
  cardIds,
  cardNames,
}: CharacterCardGalleryProps) {
  const t = useTranslations('CharacterCard.gallery')
  const { generations, total, hasMore, isLoading, loadMore } =
    useCharacterCardGallery(cardIds)

  if (isLoading && generations.length === 0) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (generations.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 py-6 text-center">
        <ImageIcon className="mx-auto mb-2 size-6 text-muted-foreground/40" />
        <p className="text-xs text-muted-foreground">{t('empty')}</p>
        {cardNames && cardNames.length > 1 && (
          <p className="mt-1 text-[10px] text-muted-foreground/60">
            {t('emptyComboHint', { names: cardNames.join(' × ') })}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {t('count', { count: total })}
        </p>
        {cardNames && cardNames.length > 1 && (
          <p className="text-[10px] text-muted-foreground/60">
            {cardNames.join(' × ')}
          </p>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {generations.map((gen) => (
          <div
            key={gen.id}
            className="group relative aspect-square overflow-hidden rounded-lg border border-border/40"
          >
            <Image
              src={gen.url}
              alt={gen.prompt}
              fill
              className="object-cover transition-transform group-hover:scale-105"
              sizes="(max-width: 640px) 33vw, 25vw"
              unoptimized
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
              <p className="line-clamp-2 text-[10px] leading-tight text-white">
                {gen.prompt}
              </p>
            </div>
          </div>
        ))}
      </div>
      {hasMore && (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full text-xs"
            disabled={isLoading}
            onClick={loadMore}
          >
            {isLoading ? (
              <Loader2 className="mr-1 size-3 animate-spin" />
            ) : null}
            {t('loadMore')}
          </Button>
        </div>
      )}
    </div>
  )
}
