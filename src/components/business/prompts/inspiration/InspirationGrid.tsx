'use client'

import { Sparkles } from '@/components/icons'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { EmptyState as EmptyStateTemplate } from '@/components/ui/empty-state'
import { Spinner } from '@/components/ui/spinner'

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
    <section className="@container space-y-4">
      <InspirationFilters
        category={filters.category}
        query={filters.query}
        sortBy={filters.sortBy}
        onCategoryChange={setCategory}
        onQueryChange={setQuery}
        onSortByChange={setSortBy}
      />

      {error ? (
        <div className="rounded-2xl border border-status-risk/40 bg-status-risk-surface p-6 text-sm text-status-risk">
          {error}
        </div>
      ) : isLoading && items.length === 0 ? (
        <GridSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          onClearFilters={() => {
            setCategory(null)
            setQuery('')
          }}
        />
      ) : (
        <>
          <div className="text-xs text-muted-foreground">
            {t('inspirationResultCount', { count: total })}
          </div>
          <div className="columns-1 gap-4 @xl:columns-2 @4xl:columns-3">
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
                {isLoadingMore ? <Spinner size="md" /> : null}
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
    <div className="columns-1 gap-4 @xl:columns-2 @4xl:columns-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="mb-4 break-inside-avoid overflow-hidden rounded-2xl border border-border/60 bg-card/60"
        >
          <div className="aspect-video animate-pulse bg-muted/50" />
          <div className="flex items-center justify-between p-4">
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted/50" />
            <div className="h-3 w-1/4 animate-pulse rounded bg-muted/50" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** 灵感墙筛不出东西 —— 走全站空态原语（ui-defaults §7）。 */
function EmptyState({ onClearFilters }: { onClearFilters: () => void }) {
  const t = useTranslations('PromptLibrary')
  return (
    <EmptyStateTemplate
      icon={<Sparkles aria-hidden />}
      title={t('inspirationEmptyTitle')}
      description={t('inspirationEmptyDescription')}
      action={
        <Button type="button" className="rounded-full" onClick={onClearFilters}>
          {t('inspirationEmptyClear')}
        </Button>
      }
    />
  )
}
