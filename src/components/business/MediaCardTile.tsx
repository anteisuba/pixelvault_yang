'use client'

import { ImageOff } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { CardTileBase } from '@/components/ui/card-tile-base'

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
    <CardTileBase
      sourceImageUrl={sourceImageUrl}
      alt={name}
      isSelected={isSelected}
      aspectClass={ASPECT_CLASS[aspect]}
      sizes={SIZES_BY_ASPECT[aspect]}
      onToggleSelect={onToggleSelect}
      selectAriaLabel={selectLabel}
      deselectAriaLabel={deselectLabel}
      onOpenDetail={onOpenDetail}
      viewDetailsLabel={tCard('viewDetails')}
      placeholder={
        <div className="absolute inset-0 flex items-center justify-center bg-muted/20 text-muted-foreground/40">
          <ImageOff className="size-6" />
        </div>
      }
      bottomOverlay={
        <>
          <div className="truncate text-sm font-medium text-white">{name}</div>
          {subtitle && (
            <div className="truncate text-[10px] text-white/70">{subtitle}</div>
          )}
        </>
      }
    />
  )
}
