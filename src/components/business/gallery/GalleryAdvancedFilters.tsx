'use client'

/**
 * GalleryAdvancedFilters — collapsible advanced filter section.
 *
 * Contains model selector + liked checkbox (low-frequency filters).
 * @see 01-UI/UI-路線決策結論書.md D12
 */

import { memo } from 'react'
import { Heart } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useAuth } from '@clerk/nextjs'

import {
  getAvailableImageModels,
  getAvailableVideoModels,
  getModelMessageKey,
} from '@/constants/models'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { toastError } from '@/lib/toast'
import type { GalleryFilters } from '@/hooks/use-gallery'
import type { OutputTypeFilter } from '@/types'

const ALL_MODELS_VALUE = '__all__'

interface GalleryAdvancedFiltersProps {
  filters: GalleryFilters
  onChange: (patch: Partial<GalleryFilters>) => void
  onClose: () => void
  type: OutputTypeFilter
}

export const GalleryAdvancedFilters = memo(function GalleryAdvancedFilters({
  filters,
  onChange,
  type,
}: GalleryAdvancedFiltersProps) {
  const t = useTranslations('GalleryPage.filters')
  const tModels = useTranslations('Models')
  const { isSignedIn } = useAuth()

  const imageModels = getAvailableImageModels()
  const videoModels = getAvailableVideoModels()
  const modelsForType =
    type === 'video'
      ? videoModels
      : type === 'image'
        ? imageModels
        : [...imageModels, ...videoModels]

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/40 bg-muted/20 px-4 py-3">
      {/* Model filter */}
      <Select
        value={filters.model || ALL_MODELS_VALUE}
        onValueChange={(v) =>
          onChange({ model: v === ALL_MODELS_VALUE ? '' : v })
        }
      >
        <SelectTrigger className="h-8 w-44 text-xs">
          <SelectValue placeholder={t('modelPlaceholder')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_MODELS_VALUE}>{t('allModels')}</SelectItem>
          {modelsForType.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {tModels(getModelMessageKey(m.id))}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Liked toggle */}
      <button
        type="button"
        onClick={() => {
          if (!isSignedIn) {
            toastError(t('signInToFavorite'))
            return
          }
          onChange({ liked: !filters.liked })
        }}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
          filters.liked
            ? 'border-primary/40 bg-primary/10 text-primary'
            : 'border-border/60 text-muted-foreground hover:text-foreground',
        )}
      >
        <Heart className={cn('size-3.5', filters.liked && 'fill-primary')} />
        {t('tabs.favorites')}
      </button>
    </div>
  )
})
