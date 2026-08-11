'use client'

import { Heart, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useRef, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { toast } from 'sonner'

import {
  getAvailableImageModels,
  getAvailableVideoModels,
  getModelMessageKey,
} from '@/constants/models'
import type { GalleryFilters } from '@/hooks/use-gallery'
import {
  GALLERY_SORT_OPTIONS,
  OUTPUT_TYPE_VALUES,
  type GallerySortOption,
  type OutputTypeValue,
} from '@/types'

import { Button } from '@/components/ui/button'
import { PlaceholdersInput } from '@/components/ui/placeholders-input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface GalleryFilterBarProps {
  filters: GalleryFilters
  onFiltersChange: (filters: GalleryFilters) => void
  isLoading: boolean
}

const ALL_MODELS_VALUE = '__all__'
/**
 * 公共画廊这一条仍是单选下拉，所以要一个「全部」哨兵值把空数组表示出来。
 * ⚠ 别把它当成 `GalleryFilters.types` 的合法成员 —— 那边空数组才是「全部」
 * （`docs/references/pages/assets.md` §3.1）。
 */
const ALL_TYPES_VALUE = 'all'
const imageModels = getAvailableImageModels()
const videoModels = getAvailableVideoModels()

type TabKey = 'all' | 'favorites' | 'today'

export function GalleryFilterBar({
  filters,
  onFiltersChange,
  isLoading,
}: GalleryFilterBarProps) {
  const t = useTranslations('GalleryPage.filters')
  const tModels = useTranslations('Models')
  const { isSignedIn } = useAuth()
  const [searchInput, setSearchInput] = useState(filters.search)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  // Derive active tab from filters
  const activeTab: TabKey = filters.liked
    ? 'favorites'
    : filters.timeRange === 'today'
      ? 'today'
      : 'all'

  const handleTabChange = useCallback(
    (tab: TabKey) => {
      if (tab === 'favorites' && !isSignedIn) {
        toast.info(t('signInToFavorite'))
        return
      }
      onFiltersChange({
        ...filters,
        liked: tab === 'favorites',
        timeRange: tab === 'today' ? 'today' : 'all',
      })
    },
    [filters, onFiltersChange, isSignedIn, t],
  )

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
  }, [filters, onFiltersChange])

  const handleModelChange = useCallback(
    (value: string) => {
      onFiltersChange({
        ...filters,
        models: value === ALL_MODELS_VALUE ? [] : [value],
      })
    },
    [filters, onFiltersChange],
  )

  const handleTypeChange = useCallback(
    (value: string) => {
      onFiltersChange({
        ...filters,
        types: value === ALL_TYPES_VALUE ? [] : [value as OutputTypeValue],
        models: [],
      })
    },
    [filters, onFiltersChange],
  )

  const handleSortChange = useCallback(
    (value: string) => {
      onFiltersChange({ ...filters, sort: value as GallerySortOption })
    },
    [filters, onFiltersChange],
  )

  const hasActiveFilters =
    filters.search ||
    filters.models.length > 0 ||
    filters.types.length > 0 ||
    filters.timeRange !== 'all' ||
    filters.liked ||
    filters.published

  const selectedType = filters.types[0] ?? ALL_TYPES_VALUE
  const modelsForType =
    selectedType === 'video'
      ? videoModels
      : selectedType === 'image'
        ? imageModels
        : [...imageModels, ...videoModels]

  const tabs: { key: TabKey; label: string; icon?: React.ReactNode }[] = [
    { key: 'all', label: t('tabs.all') },
    {
      key: 'favorites',
      label: t('tabs.favorites'),
      icon: <Heart className="size-3.5" />,
    },
    { key: 'today', label: t('tabs.today') },
  ]

  return (
    <div className="space-y-4">
      {/* Tab row */}
      <div className="flex gap-1.5" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => handleTabChange(tab.key)}
            disabled={isLoading}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-300',
              activeTab === tab.key
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-card/60 text-muted-foreground hover:bg-card hover:text-foreground',
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Existing filter row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <PlaceholdersInput
            aria-label={t('searchLabel')}
            placeholders={[
              t('searchPlaceholder'),
              t('searchHint1'),
              t('searchHint2'),
              t('searchHint3'),
            ]}
            value={searchInput}
            onChange={handleSearchChange}
            disabled={isLoading}
          />
          {searchInput ? (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={t('clearSearch')}
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Select
            value={selectedType}
            onValueChange={handleTypeChange}
            disabled={isLoading}
          >
            <SelectTrigger className="w-[130px] rounded-full border-border/70 bg-card/60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[ALL_TYPES_VALUE, ...OUTPUT_TYPE_VALUES].map((option) => (
                <SelectItem key={option} value={option}>
                  {t(`type.${option}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.models[0] ?? ALL_MODELS_VALUE}
            onValueChange={handleModelChange}
            disabled={isLoading}
          >
            <SelectTrigger className="w-[180px] rounded-full border-border/70 bg-card/60">
              <SelectValue placeholder={t('modelPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_MODELS_VALUE}>{t('allModels')}</SelectItem>
              {modelsForType.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {tModels(`${getModelMessageKey(model.id)}.label`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.sort}
            onValueChange={handleSortChange}
            disabled={isLoading}
          >
            <SelectTrigger className="w-[140px] rounded-full border-border/70 bg-card/60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GALLERY_SORT_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {t(`sort.${option}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {hasActiveFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              onFiltersChange({
                search: '',
                models: [],
                sort: filters.sort,
                types: [],
                timeRange: 'all',
                liked: false,
                published: false,
                projectId: filters.projectId,
              })
            }
            className="shrink-0 rounded-full text-muted-foreground"
            disabled={isLoading}
          >
            <X className="size-3.5" />
            {t('clearFilters')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
