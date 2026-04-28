'use client'

import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback } from 'react'

import { ROUTES } from '@/constants/routes'
import { buildGalleryQueryString } from '@/lib/gallery-query'

import { GalleryHeader } from '@/components/business/gallery/GalleryHeader'
import { GalleryGrid } from '@/components/business/GalleryGrid'
import { Button } from '@/components/ui/button'
import { PulsatingButton } from '@/components/ui/pulsating-button'
import { useGallery, type GalleryFilters } from '@/hooks/use-gallery'
import type { GenerationRecord } from '@/types'

interface GalleryFeedProps {
  initialGenerations: GenerationRecord[]
  initialPage: number
  initialHasMore: boolean
  total: number
  initialFilters: GalleryFilters
}

export function GalleryFeed({
  initialGenerations,
  initialPage,
  initialHasMore,
  total,
  initialFilters,
}: GalleryFeedProps) {
  const t = useTranslations('GalleryPage')
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
  } = useGallery({
    initialGenerations,
    initialPage,
    initialHasMore,
    initialTotal: total,
    initialFilters,
  })

  const handleFiltersChange = useCallback(
    (nextFilters: GalleryFilters) => {
      const query = buildGalleryQueryString(nextFilters)
      const nextUrl = query
        ? `${window.location.pathname}?${query}`
        : window.location.pathname

      window.history.replaceState(window.history.state, '', nextUrl)
      setFilters(nextFilters)
    },
    [setFilters],
  )

  const displayTotal = currentTotal ?? total

  return (
    <div className="space-y-7">
      <GalleryHeader
        filters={filters}
        onFiltersChange={handleFiltersChange}
        isLoading={isLoading}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="font-serif text-sm leading-7 text-muted-foreground">
            {t('feedDescription')}
          </p>
        </div>
        {generations.length !== displayTotal && (
          <span className="editorial-count-pill">
            {t('feedCount', {
              shown: generations.length,
              total: displayTotal,
            })}
          </span>
        )}
      </div>

      <GalleryGrid
        generations={generations}
        emptyTitle={t('emptyTitle')}
        emptyDescription={t('emptyDescription')}
        emptyActionHref={ROUTES.STUDIO}
        emptyActionLabel={t('emptyAction')}
        feedLabel={t('feedLabel')}
        itemFallbackLabel={t('itemFallbackLabel')}
      />

      {error ? (
        <div className="rounded-3xl border border-destructive/30 bg-destructive/6 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {hasMore ? (
        <div className="flex flex-col items-center gap-4">
          <div ref={sentinelRef} className="h-4 w-full" />
          {isLoading ? (
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled
              className="rounded-full border-border/80 bg-card/74 px-6"
            >
              <Loader2 className="size-4 animate-spin" />
              {t('loadingMore')}
            </Button>
          ) : (
            <PulsatingButton
              onClick={loadMore}
              pulseColor="hsl(var(--primary))"
              className="rounded-full px-6 text-sm"
            >
              {t('loadMore')}
            </PulsatingButton>
          )}
        </div>
      ) : generations.length > 0 ? (
        <div className="rounded-3xl border border-border/70 bg-secondary/18 px-4 py-3 text-center font-serif text-sm text-muted-foreground">
          {t('endOfArchive')}
        </div>
      ) : null}
    </div>
  )
}
