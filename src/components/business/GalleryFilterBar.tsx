'use client'

import { Search, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useRef, useState } from 'react'

import {
  AI_MODELS,
  getAvailableImageModels,
  getModelMessageKey,
} from '@/constants/models'
import type { GalleryFilters } from '@/hooks/use-gallery'
import { GALLERY_SORT_OPTIONS, type GallerySortOption } from '@/types'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

  const handleSortChange = useCallback(
    (value: string) => {
      onFiltersChange({ ...filters, sort: value as GallerySortOption })
    },
    [filters, onFiltersChange],
  )

  const hasActiveFilters = filters.search || filters.model

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t('searchPlaceholder')}
          value={searchInput}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="rounded-full border-border/70 bg-card/60 pl-9 pr-9"
          disabled={isLoading}
        />
        {searchInput ? (
          <button
            type="button"
            onClick={clearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      <div className="flex gap-2">
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
            {imageModels.map((model) => (
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
            onFiltersChange({ search: '', model: '', sort: filters.sort })
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
