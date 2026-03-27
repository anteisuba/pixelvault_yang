'use client'

import { useEffect, useMemo, useState } from 'react'
import { Trophy } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { getModelMessageKey, isBuiltInModel } from '@/constants/models'
import { ROUTES } from '@/constants/routes'
import type { LeaderboardEntry } from '@/types'
import { getArenaLeaderboardAPI } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { Link } from '@/i18n/navigation'

function getModelDisplayName(
  modelId: string,
  tModels: (key: string) => string,
): string {
  if (isBuiltInModel(modelId)) {
    return tModels(`${getModelMessageKey(modelId)}.label`)
  }
  return modelId
}

function PodiumCard({
  entry,
  rank,
  label,
  tModels,
}: {
  entry: LeaderboardEntry
  rank: number
  label: string
  tModels: (key: string) => string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 rounded-2xl border px-4 pb-4 pt-5 text-center transition-all',
        rank === 1
          ? 'order-2 border-primary/30 bg-primary/5 shadow-sm sm:scale-105'
          : rank === 2
            ? 'order-1 border-border/60 bg-card/84'
            : 'order-3 border-border/60 bg-card/84',
      )}
    >
      <span
        className={cn(
          'text-2xl font-bold',
          rank === 1
            ? 'text-primary'
            : rank === 2
              ? 'text-foreground/70'
              : 'text-foreground/50',
        )}
      >
        {label}
      </span>
      <p className="text-sm font-semibold text-foreground">
        {getModelDisplayName(entry.modelId, tModels)}
      </p>
      {entry.modelFamily && (
        <span className="text-2xs text-muted-foreground">
          {entry.modelFamily}
        </span>
      )}
      <p className="text-xl font-bold tabular-nums text-foreground">
        {entry.rating}
      </p>
      <p className="text-2xs tabular-nums text-muted-foreground">
        {entry.winRate}% win · {entry.matchCount} matches
      </p>
    </div>
  )
}

export function ArenaLeaderboard() {
  const t = useTranslations('ArenaLeaderboard')
  const tModels = useTranslations('Models')
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [familyFilter, setFamilyFilter] = useState<string>('')

  useEffect(() => {
    getArenaLeaderboardAPI().then((result) => {
      if (result.success && result.data) {
        setEntries(result.data)
      }
      setLoading(false)
    })
  }, [])

  const families = useMemo(() => {
    const set = new Set<string>()
    for (const entry of entries) {
      if (entry.modelFamily) set.add(entry.modelFamily)
    }
    return [...set].sort()
  }, [entries])

  const filtered = useMemo(
    () =>
      familyFilter
        ? entries.filter((e) => e.modelFamily === familyFilter)
        : entries,
    [entries, familyFilter],
  )

  const podiumEntries = filtered.slice(0, 3)
  const tableEntries = filtered

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <Trophy className="size-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Family filter */}
      {families.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFamilyFilter('')}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              !familyFilter
                ? 'border-primary/30 bg-primary/10 text-primary'
                : 'border-border/60 bg-card/84 text-muted-foreground hover:text-foreground',
            )}
          >
            {t('allFamilies')}
          </button>
          {families.map((family) => (
            <button
              key={family}
              type="button"
              onClick={() =>
                setFamilyFilter(familyFilter === family ? '' : family)
              }
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                familyFilter === family
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-border/60 bg-card/84 text-muted-foreground hover:text-foreground',
              )}
            >
              {family}
            </button>
          ))}
        </div>
      )}

      {/* Podium — top 3 */}
      {podiumEntries.length >= 3 && (
        <div className="grid grid-cols-3 gap-3">
          {podiumEntries.map((entry, i) => (
            <PodiumCard
              key={entry.modelId}
              entry={entry}
              rank={i + 1}
              label={
                i === 0
                  ? t('podiumFirst')
                  : i === 1
                    ? t('podiumSecond')
                    : t('podiumThird')
              }
              tModels={tModels}
            />
          ))}
        </div>
      )}

      {/* Full table */}
      <div className="overflow-hidden rounded-2xl border border-border/75">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/50 bg-muted/30">
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">
                {t('rank')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">
                {t('model')}
              </th>
              <th className="hidden px-4 py-3 text-left text-xs font-semibold text-muted-foreground md:table-cell">
                {t('family')}
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">
                {t('elo')}
              </th>
              <th className="hidden px-4 py-3 text-right text-xs font-semibold text-muted-foreground sm:table-cell">
                {t('matches')}
              </th>
              <th className="hidden px-4 py-3 text-right text-xs font-semibold text-muted-foreground sm:table-cell">
                {t('winRate')}
              </th>
            </tr>
          </thead>
          <tbody>
            {tableEntries.map((entry, index) => (
              <tr
                key={entry.modelId}
                className={cn(
                  'border-b border-border/30 transition-colors hover:bg-muted/20',
                  index === 0 && 'bg-primary/3',
                )}
              >
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'text-sm font-bold',
                      index === 0
                        ? 'text-primary'
                        : index === 1
                          ? 'text-foreground/80'
                          : index === 2
                            ? 'text-foreground/60'
                            : 'text-muted-foreground',
                    )}
                  >
                    #{index + 1}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`${ROUTES.GALLERY}?model=${encodeURIComponent(entry.modelId)}`}
                    className="text-sm font-medium text-foreground underline decoration-border/50 underline-offset-4 transition-colors hover:text-primary hover:decoration-primary/50"
                  >
                    {getModelDisplayName(entry.modelId, tModels)}
                  </Link>
                </td>
                <td className="hidden px-4 py-3 md:table-cell">
                  {entry.modelFamily && (
                    <span className="rounded-full border border-border/50 bg-muted/30 px-2 py-0.5 text-2xs text-muted-foreground">
                      {entry.modelFamily}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <p className="text-sm font-bold tabular-nums text-foreground">
                    {entry.rating}
                  </p>
                </td>
                <td className="hidden px-4 py-3 text-right sm:table-cell">
                  <p className="text-sm tabular-nums text-muted-foreground">
                    {entry.matchCount}
                  </p>
                </td>
                <td className="hidden px-4 py-3 text-right sm:table-cell">
                  <p className="text-sm tabular-nums text-muted-foreground">
                    {entry.winRate}%
                  </p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
