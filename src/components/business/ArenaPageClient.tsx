'use client'

import { BarChart3, Clock, Loader2, RotateCcw, Trophy } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { ArenaForm } from '@/components/business/ArenaForm'
import { ArenaGrid } from '@/components/business/ArenaGrid'
import { ApiKeysProvider } from '@/contexts/api-keys-context'
import { useArena } from '@/hooks/use-arena'
import { getTranslatedModelLabel } from '@/lib/model-options'
import { cn } from '@/lib/utils'

export function ArenaPageClient() {
  const t = useTranslations('ArenaPage')
  const tModels = useTranslations('Models')
  const {
    step,
    match,
    eloUpdates,
    error,
    entryProgress,
    startBattle,
    vote,
    reset,
  } = useArena()

  return (
    <div className="editorial-page">
      <div className="editorial-container">
        <section className="editorial-hero">
          <div className="editorial-hero-copy">
            <span className="editorial-eyebrow">{t('heroEyebrow')}</span>
            <h1 className="editorial-title">{t('heroTitle')}</h1>
            <p className="editorial-copy max-w-2xl">{t('heroDescription')}</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href="/arena/leaderboard">
              <Button variant="outline" className="gap-2 rounded-full">
                <Trophy className="size-4" />
                {t('leaderboardLink')}
              </Button>
            </Link>
            <Link href="/arena/history">
              <Button variant="outline" className="gap-2 rounded-full">
                <Clock className="size-4" />
                {t('historyLink')}
              </Button>
            </Link>
            <Link href="/arena/history#stats">
              <Button variant="outline" className="gap-2 rounded-full">
                <BarChart3 className="size-4" />
                {t('personalStatsLink')}
              </Button>
            </Link>
          </div>
        </section>

        <section className="editorial-panel">
          {(step === 'idle' || step === 'creating') && (
            <ApiKeysProvider>
              <ArenaForm
                isCreating={step === 'creating'}
                onBattle={startBattle}
              />
            </ApiKeysProvider>
          )}

          {step === 'generating' && entryProgress.length > 0 && (
            <div className="space-y-4">
              <div className="text-center">
                <Loader2 className="mx-auto size-6 animate-spin text-primary" />
                <p className="mt-3 text-sm font-medium text-foreground">
                  {t('generatingEntries')}
                </p>
                <p className="mt-1 font-serif text-xs text-muted-foreground">
                  {entryProgress.filter((e) => e.status === 'completed').length}
                  {' / '}
                  {entryProgress.length} {t('entriesCompleted')}
                </p>
              </div>

              <div className="mx-auto max-w-md space-y-2">
                {entryProgress.map((ep, idx) => (
                  <div
                    key={`${ep.modelId}-${idx}`}
                    className={cn(
                      'flex flex-col gap-1 rounded-xl border px-4 py-2.5',
                      ep.status === 'failed'
                        ? 'border-red-200 bg-red-50/50'
                        : 'border-border/50 bg-background/72',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          'size-2.5 shrink-0 rounded-full',
                          ep.status === 'pending' &&
                            'animate-pulse bg-amber-400',
                          ep.status === 'completed' && 'bg-emerald-500',
                          ep.status === 'failed' && 'bg-red-500',
                        )}
                      />
                      <span className="flex-1 truncate text-sm text-foreground">
                        {getTranslatedModelLabel(tModels, ep.modelId)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {ep.status === 'pending' && t('entryPending')}
                        {ep.status === 'completed' && t('entryDone')}
                        {ep.status === 'failed' && t('entryFailed')}
                      </span>
                    </div>
                    {ep.status === 'failed' && ep.error && (
                      <p className="truncate pl-5 text-2xs text-red-500">
                        {ep.error}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

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
                referenceImage={match.referenceImage ?? undefined}
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
