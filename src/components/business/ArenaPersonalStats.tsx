'use client'

import { BarChart3, Trophy } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { getModelMessageKey, isBuiltInModel } from '@/constants/models'
import { cn } from '@/lib/utils'
import { useArenaPersonalStats } from '@/hooks/use-arena-personal-stats'

function getModelDisplayName(
  modelId: string,
  tModels: (key: string) => string,
): string {
  if (isBuiltInModel(modelId)) {
    return tModels(`${getModelMessageKey(modelId)}.label`)
  }
  return modelId
}

export function ArenaPersonalStats() {
  const t = useTranslations('ArenaPersonalStats')
  const tModels = useTranslations('Models')
  const { totalMatches, stats, isLoading, error } = useArenaPersonalStats()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      </div>
    )
  }

  if (stats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12">
        <BarChart3 className="size-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      </div>
    )
  }

  const maxWinRate = Math.max(...stats.map((s) => s.winRate))

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex items-center gap-4 rounded-2xl border border-border/60 bg-card/84 px-5 py-4">
        <Trophy className="size-5 text-primary" />
        <div>
          <p className="text-2xl font-bold tabular-nums text-foreground">
            {totalMatches}
          </p>
          <p className="text-xs text-muted-foreground">{t('totalMatches')}</p>
        </div>
      </div>

      {error && (
        <div className="rounded-3xl border border-destructive/30 bg-destructive/6 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Stats table */}
      <div className="overflow-hidden rounded-2xl border border-border/75">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/50 bg-muted/30">
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">
                {t('model')}
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">
                {t('matchCount')}
              </th>
              <th className="hidden px-4 py-3 text-right text-xs font-semibold text-muted-foreground sm:table-cell">
                {t('winCount')}
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">
                {t('winRate')}
              </th>
            </tr>
          </thead>
          <tbody>
            {stats.map((stat, index) => (
              <tr
                key={stat.modelId}
                className={cn(
                  'border-b border-border/30 transition-colors hover:bg-muted/20',
                  index === 0 && 'bg-primary/3',
                )}
              >
                <td className="px-4 py-3">
                  <span className="text-sm font-medium text-foreground">
                    {getModelDisplayName(stat.modelId, tModels)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {stat.matchCount}
                  </span>
                </td>
                <td className="hidden px-4 py-3 text-right sm:table-cell">
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {stat.winCount}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted/50 sm:block">
                      <div
                        className="h-full rounded-full bg-primary/60"
                        style={{
                          width: `${maxWinRate > 0 ? (stat.winRate / maxWinRate) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium tabular-nums text-foreground">
                      {stat.winRate}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
