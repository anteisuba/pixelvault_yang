'use client'

import { X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useRef, useState } from 'react'

import {
  getAvailableImageModels,
  getAvailableVideoModels,
  getModelMessageKey,
} from '@/constants/models'
import type { GalleryFilters } from '@/hooks/use-gallery'
import {
  GALLERY_SORT_OPTIONS,
  OUTPUT_TYPE_FILTER_OPTIONS,
  type GallerySortOption,
  type OutputTypeFilter,
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

interface GalleryFilterBarProps {
  filters: GalleryFilters
  onFiltersChange: (filters: GalleryFilters) => void
  isLoading: boolean
}

const ALL_MODELS_VALUE = '__all__'
const imageModels = getAvailableImageModels()
const videoModels = getAvailableVideoModels()

export function GalleryFilterBar({
  filters,
  onFiltersChange,
  isLoading,
}: GalleryFilterBarProps) {
  const t = useTranslations('GalleryPage.filters')
  const tModels = useTranslations('Models')
  const [searchInput, setSearchInput] = useState(filters.search)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

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
        model: value === ALL_MODELS_VALUE ? '' : value,
      })
    },
    [filters, onFiltersChange],
  )

  const handleTypeChange = useCallback(
    (value: string) => {
      onFiltersChange({
        ...filters,
        type: value as OutputTypeFilter,
        model: '',
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
    filters.search || filters.model || filters.type !== 'all'

  const modelsForType =
    filters.type === 'video'
      ? videoModels
      : filters.type === 'image'
        ? imageModels
        : [...imageModels, ...videoModels]

  return (
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
          value={filters.type}
          onValueChange={handleTypeChange}
          disabled={isLoading}
        >
          <SelectTrigger className="w-[130px] rounded-full border-border/70 bg-card/60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OUTPUT_TYPE_FILTER_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {t(`type.${option}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.model || ALL_MODELS_VALUE}
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
              model: '',
              sort: filters.sort,
              type: 'all',
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
  )
}
