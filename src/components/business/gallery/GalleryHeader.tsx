'use client'

/**
 * GalleryHeader — Editorial warm filter header replacing GalleryFilterBar.
 *
 * Layout: 3 pill toggles (sort / type / timeRange) + search + Advanced popover
 * @see 01-UI/UI-路線決策結論書.md D6/D12
 */

import { memo, useCallback, useRef, useState } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { GalleryFilters } from '@/hooks/use-gallery'
import type {
  GallerySortOption,
  OutputTypeFilter,
  GalleryTimeRange,
} from '@/types'

import { GalleryAdvancedFilters } from './GalleryAdvancedFilters'

// ─── Pill Toggle ────────────────────────────────────────────────

interface PillOption<T extends string> {
  value: T
  label: string
}

function PillGroup<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: PillOption<T>[]
  value: T
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div
      className={cn(
        'inline-flex rounded-full border border-border/60 p-0.5',
        className,
      )}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={cn(
            'rounded-full px-3 py-1 text-xs font-medium transition-colors',
            value === opt.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────

interface GalleryHeaderProps {
  filters: GalleryFilters
  onFiltersChange: (filters: GalleryFilters) => void
  isLoading: boolean
}

export const GalleryHeader = memo(function GalleryHeader({
  filters,
  onFiltersChange,
  isLoading,
}: GalleryHeaderProps) {
  const t = useTranslations('GalleryPage.filters')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchInput, setSearchInput] = useState(filters.search)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  // ─── Sort pill ────────────────────────────────────────────────
  const sortOptions: PillOption<GallerySortOption>[] = [
    { value: 'newest', label: t('sort.newest') },
    { value: 'oldest', label: t('sort.oldest') },
  ]

  // ─── Type pill ────────────────────────────────────────────────
  const typeOptions: PillOption<OutputTypeFilter>[] = [
    { value: 'all', label: t('type.all') },
    { value: 'image', label: t('type.image') },
    { value: 'video', label: t('type.video') },
    { value: 'audio', label: t('type.audio') },
  ]

  // ─── Time pill ────────────────────────────────────────────────
  const timeOptions: PillOption<GalleryTimeRange>[] = [
    { value: 'all', label: t('tabs.all') },
    { value: 'today', label: t('tabs.today') },
  ]

  // ─── Search ───────────────────────────────────────────────────
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchInput(value)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        onFiltersChange({ ...filters, search: value.trim() })
      }, 400)
    },
    [filters, onFiltersChange],
  )

  const clearSearch = useCallback(() => {
    setSearchInput('')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    onFiltersChange({ ...filters, search: '' })
    setSearchOpen(false)
  }, [filters, onFiltersChange])

  // ─── Advanced filters ─────────────────────────────────────────
  const hasAdvancedFilters = filters.model || filters.liked

  const handleAdvancedChange = useCallback(
    (patch: Partial<GalleryFilters>) => {
      onFiltersChange({ ...filters, ...patch })
    },
    [filters, onFiltersChange],
  )

  // ─── Clear all ────────────────────────────────────────────────
  const hasActiveFilters =
    filters.search ||
    filters.model ||
    filters.type !== 'all' ||
    filters.timeRange !== 'all' ||
    filters.liked

  const clearAll = useCallback(() => {
    setSearchInput('')
    setSearchOpen(false)
    setAdvancedOpen(false)
    onFiltersChange({
      search: '',
      model: '',
      sort: filters.sort,
      type: 'all',
      timeRange: 'all',
      liked: false,
    })
  }, [filters.sort, onFiltersChange])

  return (
    <div className="space-y-3">
      {/* Pill row */}
      <div className="flex flex-wrap items-center gap-2">
        <PillGroup
          options={sortOptions}
          value={filters.sort}
          onChange={(v) => onFiltersChange({ ...filters, sort: v })}
        />
        <PillGroup
          options={typeOptions}
          value={filters.type}
          onChange={(v) => onFiltersChange({ ...filters, type: v, model: '' })}
        />
        <PillGroup
          options={timeOptions}
          value={filters.timeRange}
          onChange={(v) => onFiltersChange({ ...filters, timeRange: v })}
        />

        {/* Search toggle */}
        {searchOpen ? (
          <div className="flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1">
            <Search className="size-3.5 text-muted-foreground shrink-0" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-40 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              autoFocus
            />
            {searchInput && (
              <button type="button" onClick={clearSearch}>
                <X className="size-3 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors',
              filters.search && 'border-primary/40 text-primary',
            )}
          >
            <Search className="size-3.5" />
            {filters.search || t('searchLabel')}
          </button>
        )}

        {/* Advanced toggle */}
        <button
          type="button"
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors',
            (advancedOpen || hasAdvancedFilters) &&
              'border-primary/40 text-primary',
          )}
        >
          <SlidersHorizontal className="size-3.5" />
          {hasAdvancedFilters && (
            <span className="size-1.5 rounded-full bg-primary" />
          )}
        </button>

        {/* Clear all */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAll}
            className="h-7 gap-1 text-xs text-muted-foreground"
            disabled={isLoading}
          >
            <X className="size-3" />
            {t('clearFilters')}
          </Button>
        )}
      </div>

      {/* Advanced popover (inline, not floating) */}
      {advancedOpen && (
        <GalleryAdvancedFilters
          filters={filters}
          onChange={handleAdvancedChange}
          onClose={() => setAdvancedOpen(false)}
          type={filters.type}
        />
      )}
    </div>
  )
})
