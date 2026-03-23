'use client'

import { Loader2, RefreshCcw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback } from 'react'

import { ROUTES } from '@/constants/routes'
import { deleteGenerationAPI } from '@/lib/api-client'

import { GalleryFilterBar } from '@/components/business/GalleryFilterBar'
import { GalleryGrid } from '@/components/business/GalleryGrid'
import { Button } from '@/components/ui/button'
import { useGallery } from '@/hooks/use-gallery'
import type { GenerationRecord } from '@/types'

interface ProfileFeedProps {
  initialGenerations: GenerationRecord[]
  initialPage: number
  initialHasMore: boolean
  total: number
}

export function ProfileFeed({
  initialGenerations,
  initialPage,
  initialHasMore,
  total,
}: ProfileFeedProps) {
  const t = useTranslations('LibraryPage')
  const {
    generations,
    total: currentTotal,
    isLoading,
    hasMore,
    error,
    filters,
    setFilters,
    loadMore,
    sentinelRef,
    removeGeneration,
  } = useGallery({
    initialGenerations,
    initialPage,
    initialHasMore,
    initialTotal: total,
    mine: true,
  })

  const displayTotal = currentTotal ?? total

  const handleDelete = useCallback(
    async (id: string) => {
      const result = await deleteGenerationAPI(id)
      if (result.success) {
        removeGeneration(id)
      }
    },
    [removeGeneration],
  )

  return (
    <div className="space-y-7">
      <GalleryFilterBar
        filters={filters}
        onFiltersChange={setFilters}
        isLoading={isLoading}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="font-serif text-sm leading-7 text-muted-foreground">
            {t('collectionDescription')}
          </p>
        </div>
        <span className="editorial-count-pill">
          {t('collectionCount', {
            shown: generations.length,
            total: displayTotal,
          })}
        </span>
      </div>

      <GalleryGrid
        generations={generations}
        emptyTitle={t('emptyTitle')}
        emptyDescription={t('emptyDescription')}
        emptyActionHref={ROUTES.STUDIO}
        emptyActionLabel={t('emptyAction')}
        showVisibility
        showDelete
        onDelete={(id) => void handleDelete(id)}
      />

      {error ? (
        <div className="rounded-3xl border border-destructive/30 bg-destructive/6 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {hasMore ? (
        <div className="flex flex-col items-center gap-4">
          <div ref={sentinelRef} className="h-4 w-full" />
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={loadMore}
            disabled={isLoading}
            className="rounded-full border-border/80 bg-card/74 px-6"
          >
            {isLoading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t('loadingMore')}
              </>
            ) : (
              <>
                <RefreshCcw className="size-4" />
                {t('loadMore')}
              </>
            )}
          </Button>
        </div>
      ) : generations.length > 0 ? (
        <div className="rounded-3xl border border-border/70 bg-secondary/18 px-4 py-3 text-center font-serif text-sm text-muted-foreground">
          {t('endOfArchive')}
        </div>
      ) : null}
    </div>
  )
}
