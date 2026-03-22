'use client'

import { useEffect, useState } from 'react'
import { Trophy } from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { LeaderboardEntry } from '@/types'
import { getArenaLeaderboardAPI } from '@/lib/api-client'
import { cn } from '@/lib/utils'

export function ArenaLeaderboard() {
  const t = useTranslations('ArenaLeaderboard')
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getArenaLeaderboardAPI().then((result) => {
      if (result.success && result.data) {
        setEntries(result.data)
      }
      setLoading(false)
    })
  }, [])

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
          {entries.map((entry, index) => (
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
                <p className="text-sm font-medium text-foreground">
                  {entry.modelId}
                </p>
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
  )
}
