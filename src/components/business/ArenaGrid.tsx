'use client'

import { useTranslations } from 'next-intl'

import type { ArenaEntryRecord, EloUpdate } from '@/types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ArenaGridProps {
  entries: ArenaEntryRecord[]
  isRevealed: boolean
  winnerId: string | null
  eloUpdates: EloUpdate[]
  onVote: (entryId: string) => void
}

const SLOT_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']

export function ArenaGrid({
  entries,
  isRevealed,
  winnerId,
  eloUpdates,
  onVote,
}: ArenaGridProps) {
  const t = useTranslations('ArenaPage')

  const getEloChange = (modelId: string) =>
    eloUpdates.find((u) => u.modelId === modelId)

  return (
    <div
      className={cn(
        'grid gap-4',
        entries.length <= 2 && 'grid-cols-2',
        entries.length === 3 && 'grid-cols-3',
        entries.length >= 4 && 'grid-cols-2 sm:grid-cols-2',
      )}
    >
      {entries.map((entry) => {
        const isWinner = entry.id === winnerId
        const eloChange = isRevealed ? getEloChange(entry.modelId) : null

        return (
          <div
            key={entry.id}
            className={cn(
              'group relative overflow-hidden rounded-2xl border transition-all',
              isWinner
                ? 'border-primary shadow-lg shadow-primary/10'
                : 'border-border/75',
            )}
          >
            {/* Image */}
            {entry.imageUrl && (
              <div className="aspect-square overflow-hidden">
                <img
                  src={entry.imageUrl}
                  alt={`Model ${SLOT_LABELS[entry.slotIndex]}`}
                  className="size-full object-cover"
                  loading="lazy"
                />
              </div>
            )}

            {/* Footer */}
            <div className="space-y-2 p-3">
              {/* Model label */}
              <div className="flex items-center justify-between">
                <p
                  className={cn(
                    'text-sm font-semibold',
                    isRevealed ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {isRevealed
                    ? entry.modelId
                    : `${t('modelSlot')} ${SLOT_LABELS[entry.slotIndex]}`}
                </p>
                {isWinner && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                    {t('winner')}
                  </span>
                )}
              </div>

              {/* ELO change */}
              {eloChange && (
                <p
                  className={cn(
                    'text-xs font-medium',
                    eloChange.change > 0
                      ? 'text-green-600'
                      : eloChange.change < 0
                        ? 'text-red-500'
                        : 'text-muted-foreground',
                  )}
                >
                  ELO: {eloChange.newRating} ({eloChange.change > 0 ? '+' : ''}
                  {eloChange.change})
                </p>
              )}

              {/* Vote button */}
              {!isRevealed && (
                <Button
                  type="button"
                  size="sm"
                  variant={isWinner ? 'default' : 'outline'}
                  onClick={() => onVote(entry.id)}
                  className="w-full rounded-full"
                >
                  {t('voteButton')}
                </Button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
