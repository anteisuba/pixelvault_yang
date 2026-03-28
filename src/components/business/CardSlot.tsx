'use client'

import { useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Plus,
  X,
  User,
  Image as ImageIcon,
  Palette,
  Cpu,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'
import type { CardType } from '@/constants/card-types'

// ─── Card Type Config ───────────────────────────────────────────

const CARD_TYPE_CONFIG: Record<
  CardType,
  { icon: typeof User; colorClass: string }
> = {
  CHARACTER: { icon: User, colorClass: 'text-chart-3' },
  BACKGROUND: { icon: ImageIcon, colorClass: 'text-secondary' },
  STYLE: { icon: Palette, colorClass: 'text-primary' },
  MODEL: { icon: Cpu, colorClass: 'text-chart-5' },
}

// ─── Types ──────────────────────────────────────────────────────

interface CardItem {
  id: string
  name: string
}

interface CardSlotProps {
  cardType: CardType
  items: CardItem[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  isLoading?: boolean
  badge?: string
}

// ─── Component ──────────────────────────────────────────────────

export function CardSlot({
  cardType,
  items,
  selectedId,
  onSelect,
  isLoading,
  badge,
}: CardSlotProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const t = useTranslations('CardSlot')

  const config = CARD_TYPE_CONFIG[cardType]
  const Icon = config.icon
  const selectedItem = items.find((item) => item.id === selectedId)
  const label = t(
    cardType.toLowerCase() as 'character' | 'background' | 'style' | 'model',
  )

  return (
    <div className="rounded-lg border border-border/60 bg-background/50 overflow-hidden">
      {/* Collapsed header — always visible */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/30"
      >
        <Icon className={cn('size-4 shrink-0', config.colorClass)} />
        <span className="text-sm font-medium text-foreground">{label}</span>

        {selectedItem ? (
          <span className="ml-auto mr-2 max-w-[140px] truncate text-xs text-muted-foreground">
            {selectedItem.name}
          </span>
        ) : (
          <span className="ml-auto mr-2 text-xs text-muted-foreground/60">
            {t('empty')}
          </span>
        )}

        {badge && (
          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            {badge}
          </span>
        )}

        {isExpanded ? (
          <ChevronUp className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        )}
      </button>

      {/* Expanded content — card list */}
      {isExpanded && (
        <div className="border-t border-border/40 px-3 py-2 space-y-1">
          {isLoading ? (
            <div className="py-3 text-center text-xs text-muted-foreground">
              Loading...
            </div>
          ) : items.length === 0 ? (
            <div className="py-3 text-center text-xs text-muted-foreground/60">
              {t('empty')}
            </div>
          ) : (
            <>
              {/* Clear selection */}
              {selectedId && (
                <button
                  type="button"
                  onClick={() => {
                    onSelect(null)
                    setIsExpanded(false)
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted/30 transition-colors"
                >
                  <X className="size-3" />
                  {t('empty')}
                </button>
              )}

              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelect(item.id)
                    setIsExpanded(false)
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
                    item.id === selectedId
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-foreground hover:bg-muted/30',
                  )}
                >
                  <Plus
                    className={cn(
                      'size-3 shrink-0',
                      item.id === selectedId
                        ? 'text-primary'
                        : 'text-muted-foreground',
                    )}
                  />
                  <span className="truncate">{item.name}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
