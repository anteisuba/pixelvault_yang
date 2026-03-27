'use client'

import { Clock, Loader2, RefreshCcw, Trophy } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { getModelMessageKey, isBuiltInModel } from '@/constants/models'
import type { ArenaHistoryEntry } from '@/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useArenaHistory } from '@/hooks/use-arena-history'

function getModelDisplayName(
  modelId: string,
  tModels: (key: string) => string,
): string {
  if (isBuiltInModel(modelId)) {
    return tModels(`${getModelMessageKey(modelId)}.label`)
  }
  return modelId
}

function MatchCard({
  match,
  tModels,
  t,
}: {
  match: ArenaHistoryEntry
  tModels: (key: string) => string
  t: (key: string) => string
}) {
  const winnerEntry = match.entries.find((e) => e.wasVoted)

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/84 transition-all hover:border-border">
      {/* Thumbnail grid */}
      <div className="grid grid-cols-2 gap-px bg-border/30">
        {match.entries.map((entry) => (
          <div key={entry.id} className="relative bg-card">
            {entry.imageUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={entry.imageUrl}
                alt={getModelDisplayName(entry.modelId, tModels)}
                className={cn(
                  'aspect-square w-full object-cover',
                  entry.wasVoted && 'ring-2 ring-inset ring-primary/40',
                )}
              />
            ) : (
              <div className="flex aspect-square items-center justify-center bg-muted/30">
                <span className="text-xs text-muted-foreground">—</span>
              </div>
            )}
            <div className="absolute bottom-1 left-1 right-1">
              <span
                className={cn(
                  'inline-block max-w-full truncate rounded-full px-2 py-0.5 text-2xs font-medium backdrop-blur-sm',
                  entry.wasVoted
                    ? 'bg-primary/80 text-primary-foreground'
                    : 'bg-black/50 text-white/80',
                )}
              >
                {getModelDisplayName(entry.modelId, tModels)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Match info */}
      <div className="space-y-2 p-3">
        <p className="line-clamp-2 font-serif text-sm text-foreground/80">
          {match.prompt}
        </p>
        <div className="flex items-center justify-between text-2xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Trophy className="size-3" />
            {winnerEntry
              ? getModelDisplayName(winnerEntry.modelId, tModels)
              : t('winner')}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {new Date(match.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>
    </div>
  )
}

export function ArenaHistory() {
  const t = useTranslations('ArenaHistory')
  const tModels = useTranslations('Models')
  const { matches, total, isLoading, hasMore, error, loadMore } =
    useArenaHistory()

  if (isLoading && matches.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      </div>
    )
  }

  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <Trophy className="size-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <p className="font-serif text-sm text-muted-foreground">
        {t('totalMatches', { count: total })}
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {matches.map((match) => (
          <MatchCard key={match.id} match={match} tModels={tModels} t={t} />
        ))}
      </div>

      {error && (
        <div className="rounded-3xl border border-destructive/30 bg-destructive/6 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <Button
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
      )}
    </div>
  )
}
