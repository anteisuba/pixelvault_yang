'use client'

import { Loader2, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'

import { InspirationCard } from './InspirationCard'
import { InspirationFilters } from './InspirationFilters'
import { useInspirations } from '@/hooks/prompts/use-inspirations'

export function InspirationGrid() {
  const t = useTranslations('PromptLibrary')
  const {
    items,
    total,
    isLoading,
    isLoadingMore,
    error,
    filters,
    hasMore,
    setCategory,
    setQuery,
    setSortBy,
    loadMore,
    cloneInspiration,
  } = useInspirations()

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <p className="editorial-eyebrow">{t('inspirationEyebrow')}</p>
        <h1 className="font-display text-2xl font-medium tracking-tight">
          {t('inspirationTitle')}
        </h1>
        <p className="max-w-2xl font-serif text-sm leading-6 text-muted-foreground">
          {t('inspirationDescription')}
        </p>
      </header>

      <InspirationFilters
        category={filters.category}
        query={filters.query}
        sortBy={filters.sortBy}
        onCategoryChange={setCategory}
        onQueryChange={setQuery}
        onSortByChange={setSortBy}
      />

      {error ? (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
          {error}
        </div>
      ) : isLoading && items.length === 0 ? (
        <GridSkeleton />
      ) : items.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="text-xs text-muted-foreground">
            {t('inspirationResultCount', { count: total })}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((inspiration) => (
              <InspirationCard
                key={inspiration.id}
                inspiration={inspiration}
                onClone={cloneInspiration}
              />
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={isLoadingMore}
                onClick={() => void loadMore()}
                className="h-10 rounded-full px-6"
              >
                {isLoadingMore ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                {isLoadingMore
                  ? t('inspirationLoadingMore')
                  : t('inspirationLoadMore')}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function GridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-2xl border border-border/60 bg-card/60"
        >
          <div className="aspect-4/5 animate-pulse bg-muted/50" />
          <div className="flex items-center justify-between p-4">
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted/50" />
            <div className="h-3 w-1/4 animate-pulse rounded bg-muted/50" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState() {
  const t = useTranslations('PromptLibrary')
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/60 bg-card/50 p-10 text-center">
      <Sparkles className="size-8 text-primary/70" />
      <h3 className="font-display text-lg font-medium">
        {t('inspirationEmptyTitle')}
      </h3>
      <p className="max-w-sm font-serif text-sm leading-6 text-muted-foreground">
        {t('inspirationEmptyDescription')}
      </p>
    </div>
  )
}
