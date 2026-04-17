'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Plus, Search, Settings2 } from 'lucide-react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'

import { STUDIO_CARD_SORT_OPTIONS } from '@/constants/studio'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

interface CardItem {
  id: string
  name: string
  sourceImageUrl: string | null
  tags?: string[]
  createdAt?: Date | string | number | null
  lastUsedAt?: Date | string | number | null
}

interface CardDropdownProps {
  /** Display label for the dropdown (e.g. "角色", "背景", "画风") */
  label: string
  cards: CardItem[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  /** Called when user clicks "+ 新建" */
  onCreateNew?: () => void
  /** Called when user clicks "管理" */
  onManage?: () => void
  disabled?: boolean
  isLoading?: boolean
  /** Placeholder when nothing is selected */
  placeholder?: string
}

type CardSortMode = (typeof STUDIO_CARD_SORT_OPTIONS)[number]

function toTimestampMs(value: CardItem['createdAt']): number {
  if (value instanceof Date) {
    return value.getTime()
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? 0 : parsed
  }

  return 0
}

/**
 * Compact card picker dropdown for Studio V2 Layer 1.
 * Shows current selection + thumbnail, opens a popover list.
 */
export function CardDropdown({
  label,
  cards,
  selectedId,
  onSelect,
  onCreateNew,
  onManage,
  disabled = false,
  isLoading = false,
  placeholder,
}: CardDropdownProps) {
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortMode, setSortMode] = useState<CardSortMode>('recent')
  const ref = useRef<HTMLDivElement>(null)
  const t = useTranslations('StudioV2')

  const selectedCard = cards.find((c) => c.id === selectedId) ?? null
  const normalizedQuery = searchQuery.trim().toLowerCase()
  const showTools =
    cards.length > 5 || cards.some((card) => (card.tags?.length ?? 0) > 0)

  const visibleCards = [...cards]
    .filter((card) => {
      if (!normalizedQuery) {
        return true
      }

      const searchTarget = [card.name, ...(card.tags ?? [])]
        .join(' ')
        .toLowerCase()

      return searchTarget.includes(normalizedQuery)
    })
    .sort((left, right) => {
      if (sortMode === 'name') {
        return left.name.localeCompare(right.name)
      }

      const leftPrimary =
        sortMode === 'recent'
          ? toTimestampMs(left.lastUsedAt)
          : toTimestampMs(left.createdAt)
      const rightPrimary =
        sortMode === 'recent'
          ? toTimestampMs(right.lastUsedAt)
          : toTimestampMs(right.createdAt)

      if (rightPrimary !== leftPrimary) {
        return rightPrimary - leftPrimary
      }

      const rightCreatedAt = toTimestampMs(right.createdAt)
      const leftCreatedAt = toTimestampMs(left.createdAt)

      if (rightCreatedAt !== leftCreatedAt) {
        return rightCreatedAt - leftCreatedAt
      }

      return left.name.localeCompare(right.name)
    })

  const closeDropdown = () => {
    setOpen(false)
    setSearchQuery('')
    setSortMode('recent')
  }

  const toggleDropdown = () => {
    if (open) {
      closeDropdown()
      return
    }

    setOpen(true)
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        closeDropdown()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      {isLoading ? (
        /* Loading skeleton */
        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2">
          <Skeleton className="size-5 rounded flex-shrink-0" />
          <span className="text-xs text-muted-foreground">{label}</span>
          <Skeleton className="h-4 w-16 rounded" />
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={toggleDropdown}
          className={cn(
            'flex items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2',
            'text-sm font-medium text-foreground transition-colors',
            'hover:bg-muted/30 hover:border-primary',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            open && 'border-primary bg-muted/30',
          )}
        >
          {/* Thumbnail */}
          {selectedCard?.sourceImageUrl ? (
            <Image
              src={selectedCard.sourceImageUrl}
              alt={selectedCard.name}
              width={20}
              height={20}
              className="rounded object-cover flex-shrink-0"
            />
          ) : (
            <span className="w-5 h-5 rounded bg-muted flex-shrink-0" />
          )}

          {/* Label */}
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className="max-w-[100px] truncate">
            {selectedCard?.name ?? placeholder ?? t('none')}
          </span>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 text-muted-foreground transition-transform',
              open && 'rotate-180',
            )}
          />
        </button>
      )}

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-lg border border-border/60 bg-background shadow-lg">
          {showTools && (
            <div className="space-y-2 border-b border-border/60 p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={t('searchCardsPlaceholder')}
                  className="h-8 w-full rounded-md border border-border/60 bg-background pl-8 pr-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/20"
                />
              </div>
              <label className="sr-only" htmlFor={`${label}-card-sort`}>
                {t('sortCardsLabel')}
              </label>
              <select
                id={`${label}-card-sort`}
                value={sortMode}
                onChange={(event) =>
                  setSortMode(event.target.value as CardSortMode)
                }
                className="h-8 w-full rounded-md border border-border/60 bg-background px-2 text-xs text-foreground focus:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/20"
              >
                <option value="recent">{t('sortCardsRecent')}</option>
                <option value="created">{t('sortCardsCreated')}</option>
                <option value="name">{t('sortCardsName')}</option>
              </select>
            </div>
          )}

          {/* None option */}
          <button
            type="button"
            onClick={() => {
              onSelect(null)
              closeDropdown()
            }}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground',
              'hover:bg-muted/30 rounded-t-lg',
              !selectedId && 'bg-muted/30 text-foreground',
            )}
          >
            <span className="w-6 h-6 rounded bg-muted" />
            {t('none')}
          </button>

          {/* Card list */}
          <div className="max-h-48 overflow-y-auto">
            {cards.length === 0 && (
              <div className="px-3 py-4 text-center">
                <p className="text-xs text-muted-foreground/60 font-serif">
                  {t('noCards')}
                </p>
              </div>
            )}
            {cards.length > 0 && visibleCards.length === 0 && (
              <div className="px-3 py-4 text-center">
                <p className="text-xs text-muted-foreground/60 font-serif">
                  {t('cardSearchEmpty')}
                </p>
              </div>
            )}
            {visibleCards.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => {
                  onSelect(card.id)
                  closeDropdown()
                }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground',
                  'hover:bg-muted/30',
                  selectedId === card.id && 'bg-muted/30',
                )}
              >
                {card.sourceImageUrl ? (
                  <Image
                    src={card.sourceImageUrl}
                    alt={card.name}
                    width={24}
                    height={24}
                    className="rounded object-cover flex-shrink-0"
                  />
                ) : (
                  <span className="w-6 h-6 rounded bg-muted flex-shrink-0" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{card.name}</span>
                  {card.tags && card.tags.length > 0 ? (
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {card.tags.join(', ')}
                    </span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>

          {/* Footer actions */}
          <div className="border-t border-border/60 p-1 flex gap-1">
            {onCreateNew && (
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 h-7 text-xs text-primary hover:text-primary hover:bg-primary/5"
                onClick={() => {
                  onCreateNew()
                  closeDropdown()
                }}
              >
                <Plus className="h-3 w-3 mr-1" />
                {t('new')}
              </Button>
            )}
            {onManage && (
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 h-7 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  onManage()
                  closeDropdown()
                }}
              >
                <Settings2 className="h-3 w-3 mr-1" />
                {t('manage')}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
