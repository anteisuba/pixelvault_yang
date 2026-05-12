'use client'

import { Info } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'

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
    <div className="group relative">
      <button
        type="button"
        onClick={onToggleSelect}
        aria-pressed={isSelected}
        aria-label={isSelected ? t('deselectCard') : t('selectCard')}
        className={cn(
          'relative block aspect-[3/4] w-full overflow-hidden rounded-lg border bg-card transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
          isSelected
            ? 'scale-[0.96] border-primary ring-2 ring-primary'
            : 'border-white/10 hover:scale-[1.02] hover:border-white/30',
        )}
      >
        {card.sourceImageUrl ? (
          <Image
            src={card.sourceImageUrl}
            alt={card.name}
            fill
            sizes="(min-width: 640px) 240px, 50vw"
            className="object-cover"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 bg-muted/30" />
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2.5 pb-2 pt-8">
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
        </div>

        {card.variantLabel && (
          <span className="absolute left-2 top-2 max-w-[60%] truncate rounded-full bg-primary/90 px-2 py-0.5 text-[10px] font-medium text-primary-foreground backdrop-blur-sm">
            {card.variantLabel}
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={onOpenDetail}
        aria-label={tCard('viewDetails')}
        className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity hover:bg-black/80 focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Info className="size-3.5" />
      </button>
    </div>
  )
}
