'use client'

import { useId } from 'react'
import { Plus, Search } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { STUDIO_CARD_SORT_OPTIONS } from '@/constants/studio'
import type { CardManagerSortMode } from '@/lib/card-management'

interface CardManagerToolbarProps {
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  sortMode: CardManagerSortMode
  onSortModeChange: (value: CardManagerSortMode) => void
  createLabel?: string
  onCreate?: () => void
  createDisabled?: boolean
}

export function CardManagerToolbar({
  searchQuery,
  onSearchQueryChange,
  sortMode,
  onSortModeChange,
  createLabel,
  onCreate,
  createDisabled = false,
}: CardManagerToolbarProps) {
  const t = useTranslations('StudioV2')
  const sortId = useId()

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60" />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder={t('searchCardsPlaceholder')}
            className="h-8 w-full rounded-md border border-border/60 bg-background pl-8 pr-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/20"
          />
        </div>
        <label className="sr-only" htmlFor={sortId}>
          {t('sortCardsLabel')}
        </label>
        <select
          id={sortId}
          value={sortMode}
          onChange={(event) => {
            const nextSortMode =
              STUDIO_CARD_SORT_OPTIONS.find(
                (option) => option === event.target.value,
              ) ?? 'recent'
            onSortModeChange(nextSortMode)
          }}
          className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs text-foreground focus:border-primary/30 focus:outline-none focus:ring-1 focus:ring-primary/20"
        >
          <option value="recent">{t('sortCardsRecent')}</option>
          <option value="created">{t('sortCardsCreated')}</option>
          <option value="name">{t('sortCardsName')}</option>
        </select>
      </div>

      {onCreate && createLabel ? (
        <button
          type="button"
          disabled={createDisabled}
          onClick={onCreate}
          className="flex items-center gap-1 rounded-md border border-primary/30 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/5 disabled:opacity-50"
        >
          <Plus className="size-3" />
          {createLabel}
        </button>
      ) : null}
    </div>
  )
}
