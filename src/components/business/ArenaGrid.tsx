'use client'

import Image from 'next/image'
import { useTranslations } from 'next-intl'

import { OptimizedImage } from '@/components/ui/optimized-image'

import type { ArenaEntryRecord, EloUpdate } from '@/types'
import { Button } from '@/components/ui/button'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { cn } from '@/lib/utils'

interface ArenaGridProps {
  entries: ArenaEntryRecord[]
  isRevealed: boolean
  winnerId: string | null
  eloUpdates: EloUpdate[]
  onVote: (entryId: string) => void
  referenceImage?: string
}

const SLOT_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']

export function ArenaGrid({
  entries,
  isRevealed,
  winnerId,
  eloUpdates,
  onVote,
  referenceImage,
}: ArenaGridProps) {
  const t = useTranslations('ArenaPage')
  const tModels = useTranslations('Models')

  const getEloChange = (modelId: string) =>
    eloUpdates.find((u) => u.modelId === modelId)

  return (
    <div className="space-y-4">
      {referenceImage && (
        <div className="flex items-center gap-3 rounded-2xl border border-border/50 bg-muted/20 p-3">
          <div className="relative size-16 shrink-0 overflow-hidden rounded-xl">
            <Image
              src={referenceImage}
              alt={t('referenceImage')}
              fill
              sizes="64px"
              className="object-cover"
              loading="lazy"
            />
          </div>
          <p className="font-serif text-xs text-muted-foreground">
            {t('referenceImage')}
          </p>
        </div>
      )}
      <div
        role="group"
        aria-label={t('arenaComparison')}
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
                <div className="relative aspect-square overflow-hidden">
                  <OptimizedImage
                    src={entry.imageUrl}
                    alt={`Model ${SLOT_LABELS[entry.slotIndex]}`}
                    fill
                    sizes="(max-width: 640px) 100vw, 50vw"
                    className="object-cover"
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
                      ? getTranslatedModelLabel(tModels, entry.modelId)
                      : t('modelSlot', { index: SLOT_LABELS[entry.slotIndex] })}
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
                    ELO: {eloChange.newRating} (
                    {eloChange.change > 0 ? '+' : ''}
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
                    aria-label={`${t('voteButton')} ${SLOT_LABELS[entry.slotIndex]}`}
                  >
                    {t('voteButton')}
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
