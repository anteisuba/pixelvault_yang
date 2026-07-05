'use client'

import { Search } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { PromptFilterChip } from '@/components/business/prompts/PromptFilterChip'
import type { InspirationSortBy } from '@/types'

export const INSPIRATION_CATEGORIES = [
  'Photography',
  'Illustration & 3D',
  'Product & Brand',
  'Food & Drink',
  'Poster Design',
  'UI & Graphic',
] as const

const NATIVE_OPTION_CLASS_NAME = 'bg-popover text-popover-foreground'

interface InspirationFiltersProps {
  category: string | null
  query: string
  sortBy: InspirationSortBy
  onCategoryChange: (category: string | null) => void
  onQueryChange: (query: string) => void
  onSortByChange: (sortBy: InspirationSortBy) => void
}

export function InspirationFilters({
  category,
  query,
  sortBy,
  onCategoryChange,
  onQueryChange,
  onSortByChange,
}: InspirationFiltersProps) {
  const t = useTranslations('PromptLibrary')

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            inputMode="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={t('inspirationSearchPlaceholder')}
            className="h-10 rounded-full pl-9"
            maxLength={200}
          />
        </div>
        <div className="flex items-center gap-2">
          <label
            htmlFor="inspiration-sort"
            className="text-xs font-medium text-muted-foreground"
          >
            {t('inspirationSortLabel')}
          </label>
          <select
            id="inspiration-sort"
            value={sortBy}
            onChange={(e) =>
              onSortByChange(e.target.value as InspirationSortBy)
            }
            className={cn(
              'h-10 rounded-full border border-input bg-transparent px-3 text-sm outline-none transition-[color,box-shadow]',
              'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
            )}
          >
            <option value="rank" className={NATIVE_OPTION_CLASS_NAME}>
              {t('inspirationSortRank')}
            </option>
            <option value="likes" className={NATIVE_OPTION_CLASS_NAME}>
              {t('inspirationSortLikes')}
            </option>
            <option value="views" className={NATIVE_OPTION_CLASS_NAME}>
              {t('inspirationSortViews')}
            </option>
            <option value="recent" className={NATIVE_OPTION_CLASS_NAME}>
              {t('inspirationSortRecent')}
            </option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <PromptFilterChip
          label={t('inspirationCategoryAll')}
          active={category === null}
          onClick={() => onCategoryChange(null)}
        />
        {INSPIRATION_CATEGORIES.map((cat) => (
          <PromptFilterChip
            key={cat}
            label={cat}
            active={category === cat}
            onClick={() => onCategoryChange(cat)}
          />
        ))}
      </div>
    </div>
  )
}
