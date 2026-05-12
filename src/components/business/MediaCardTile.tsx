'use client'

import { Info, ImageOff } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'

import { cn } from '@/lib/utils'

export type MediaCardAspect = 'video' | 'square' | 'portrait'

interface MediaCardTileProps {
  name: string
  sourceImageUrl: string | null
  subtitle?: string | null
  isSelected: boolean
  aspect: MediaCardAspect
  selectLabel: string
  deselectLabel: string
  onToggleSelect: () => void
  onOpenDetail?: () => void
}

const ASPECT_CLASS: Record<MediaCardAspect, string> = {
  video: 'aspect-video',
  square: 'aspect-square',
  portrait: 'aspect-[3/4]',
}

const SIZES_BY_ASPECT: Record<MediaCardAspect, string> = {
  video: '(min-width: 640px) 200px, 50vw',
  square: '(min-width: 640px) 160px, 33vw',
  portrait: '(min-width: 640px) 240px, 50vw',
}

export function MediaCardTile({
  name,
  sourceImageUrl,
  subtitle,
  isSelected,
  aspect,
  selectLabel,
  deselectLabel,
  onToggleSelect,
  onOpenDetail,
}: MediaCardTileProps) {
  const tCard = useTranslations('CardSlot')

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onToggleSelect}
        aria-pressed={isSelected}
        aria-label={isSelected ? deselectLabel : selectLabel}
        className={cn(
          'relative block w-full overflow-hidden rounded-lg border bg-card transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
          ASPECT_CLASS[aspect],
          isSelected
            ? 'scale-[0.96] border-primary ring-2 ring-primary'
            : 'border-white/10 hover:scale-[1.02] hover:border-white/30',
        )}
      >
        {sourceImageUrl ? (
          <Image
            src={sourceImageUrl}
            alt={name}
            fill
            sizes={SIZES_BY_ASPECT[aspect]}
            className="object-cover"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/20 text-muted-foreground/40">
            <ImageOff className="size-6" />
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2.5 pb-2 pt-8">
          <div className="truncate text-sm font-medium text-white">{name}</div>
          {subtitle && (
            <div className="truncate text-[10px] text-white/70">{subtitle}</div>
          )}
        </div>
      </button>

      {onOpenDetail && (
        <button
          type="button"
          onClick={onOpenDetail}
          aria-label={tCard('viewDetails')}
          className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity hover:bg-black/80 focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Info className="size-3.5" />
        </button>
      )}
    </div>
  )
}
