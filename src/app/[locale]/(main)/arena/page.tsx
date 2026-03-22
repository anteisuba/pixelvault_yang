'use client'

import { RotateCcw, Trophy } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { ArenaForm } from '@/components/business/ArenaForm'
import { ArenaGrid } from '@/components/business/ArenaGrid'
import { useArena } from '@/hooks/use-arena'

export default function ArenaPage() {
  const t = useTranslations('ArenaPage')
  const { step, match, eloUpdates, error, startBattle, vote, reset } =
    useArena()

  return (
    <div className="editorial-page">
      <div className="editorial-container">
        <section className="editorial-hero">
          <div className="editorial-hero-copy">
            <span className="editorial-eyebrow">{t('heroEyebrow')}</span>
            <h1 className="editorial-title">{t('heroTitle')}</h1>
            <p className="editorial-copy max-w-2xl">{t('heroDescription')}</p>
          </div>

          <div className="flex gap-3">
            <Link href="/arena/leaderboard">
              <Button variant="outline" className="gap-2 rounded-full">
                <Trophy className="size-4" />
                {t('leaderboardLink')}
              </Button>
            </Link>
          </div>
        </section>

        <section className="editorial-panel">
          {/* Idle — show form */}
          {(step === 'idle' || step === 'creating') && (
            <ArenaForm
              isCreating={step === 'creating'}
              onBattle={startBattle}
            />
          )}

          {/* Voting or Revealed — show grid */}
          {match && (step === 'voting' || step === 'revealed') && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
                <p className="text-xs font-medium text-muted-foreground">
                  {t('promptUsed')}
                </p>
                <p className="mt-1 font-serif text-sm text-foreground">
                  {match.prompt}
                </p>
              </div>

              {step === 'voting' && (
                <p className="text-center text-sm font-medium text-foreground">
                  {t('voteInstruction')}
                </p>
              )}

              <ArenaGrid
                entries={match.entries}
                isRevealed={step === 'revealed'}
                winnerId={match.winnerId}
                eloUpdates={eloUpdates}
                onVote={vote}
              />

              {step === 'revealed' && (
                <div className="flex justify-center">
                  <Button
                    onClick={reset}
                    variant="outline"
                    className="gap-2 rounded-full"
                  >
                    <RotateCcw className="size-4" />
                    {t('newBattle')}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
