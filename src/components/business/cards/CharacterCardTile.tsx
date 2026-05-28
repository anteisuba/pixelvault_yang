'use client'

import { useTranslations } from 'next-intl'

import { CardTileBase } from '@/components/ui/card-tile-base'
import type { CharacterCardRecord } from '@/types'
import { cn } from '@/lib/utils'

interface CharacterCardTileProps {
  card: CharacterCardRecord
  isSelected: boolean
  onToggleSelect: () => void
  onOpenDetail: () => void
}

const STATUS_DOT: Record<string, string> = {
  DRAFT: 'bg-zinc-400',
  REFINING: 'bg-chart-3',
  STABLE: 'bg-emerald-500',
  ARCHIVED: 'bg-zinc-500/50',
}

export function CharacterCardTile({
  card,
  isSelected,
  onToggleSelect,
  onOpenDetail,
}: CharacterCardTileProps) {
  const t = useTranslations('CharacterCard')
  const tCard = useTranslations('CardSlot')
  const variantCount = card.variants?.length ?? 0

  return (
    <CardTileBase
      sourceImageUrl={card.sourceImageUrl}
      alt={card.name}
      isSelected={isSelected}
      aspectClass="aspect-[3/4]"
      sizes="(min-width: 640px) 240px, 50vw"
      onToggleSelect={onToggleSelect}
      selectAriaLabel={t('selectCard')}
      deselectAriaLabel={t('deselectCard')}
      onOpenDetail={onOpenDetail}
      viewDetailsLabel={tCard('viewDetails')}
      topLeftBadge={
        card.variantLabel ? (
          <span className="absolute left-2 top-2 max-w-[60%] truncate rounded-full bg-primary/90 px-2 py-0.5 text-[10px] font-medium text-primary-foreground backdrop-blur-sm">
            {card.variantLabel}
          </span>
        ) : null
      }
      bottomOverlay={
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              STATUS_DOT[card.status] ?? STATUS_DOT.DRAFT,
            )}
            aria-hidden
          />
          <span className="truncate text-sm font-medium text-white">
            {card.name}
          </span>
          {variantCount > 0 && (
            <span className="ml-auto shrink-0 rounded-full bg-white/15 px-1.5 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur-sm">
              +{variantCount}
            </span>
          )}
        </div>
      }
    />
  )
}
