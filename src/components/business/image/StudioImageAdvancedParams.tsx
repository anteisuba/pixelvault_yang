'use client'

import { memo, useCallback } from 'react'
import { Dices } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { useStudioForm } from '@/contexts/studio-context'
import { cn } from '@/lib/utils'

const SEED_MIN = 0
const SEED_MAX = 4_294_967_295

/**
 * StudioImageAdvancedParams — the image-mode body of the «Advanced»
 * panel. Currently exposes the controls that matter for the "stable
 * generate → tweak one tag → regenerate" workflow:
 *
 *   - Seed: the difference between reproducible and lucky-dip output
 *   - Negative prompt: the quickest way to push the model away from
 *     repeated unwanted artefacts
 *
 * Steps / guidanceScale are deliberately omitted from this first cut.
 * They're power-user knobs that mostly confuse mid-tier users; we'll
 * add them in a Phase-2 expansion if the data warrants it. Schema-wise
 * `AdvancedParams` already accepts them, so they can land later without
 * a migration.
 *
 * Rendered inside the centred Dialog from StudioDockPanelArea — the
 * Dialog owns the title + close button; this component renders only
 * the body controls.
 */
export const StudioImageAdvancedParams = memo(
  function StudioImageAdvancedParams() {
    const { state, dispatch } = useStudioForm()
    const t = useTranslations('StudioImageAdvancedParams')

    const advancedParams = state.advancedParams
    // seed === undefined / null / -1 all mean "random". Normalise to a
    // single sentinel on read so the input renders consistently.
    const seedValue =
      typeof advancedParams.seed === 'number' && advancedParams.seed >= 0
        ? advancedParams.seed
        : null
    const negativePrompt = advancedParams.negativePrompt ?? ''

    const setSeed = useCallback(
      (next: number | null) => {
        dispatch({
          type: 'SET_ADVANCED_PARAMS',
          payload: {
            ...advancedParams,
            seed: next ?? undefined,
          },
        })
      },
      [advancedParams, dispatch],
    )

    const setNegative = useCallback(
      (value: string) => {
        dispatch({
          type: 'SET_ADVANCED_PARAMS',
          payload: {
            ...advancedParams,
            negativePrompt: value || undefined,
          },
        })
      },
      [advancedParams, dispatch],
    )

    const handleSeedInput = useCallback(
      (raw: string) => {
        const trimmed = raw.trim()
        if (!trimmed) {
          setSeed(null)
          return
        }
        const parsed = Number(trimmed)
        if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return
        const clamped = Math.min(SEED_MAX, Math.max(SEED_MIN, parsed))
        setSeed(clamped)
      },
      [setSeed],
    )

    const randomiseSeed = useCallback(() => setSeed(null), [setSeed])

    const isLocked = seedValue !== null

    return (
      <div className="space-y-4">
        {/* Seed */}
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <label
              htmlFor="advanced-seed-input"
              className="text-2xs font-medium text-muted-foreground/70"
            >
              {t('seedLabel')}
            </label>
            <span
              className={cn(
                'text-2xs font-medium',
                isLocked ? 'text-primary' : 'text-muted-foreground/60',
              )}
            >
              {isLocked ? t('seedLocked') : t('seedRandom')}
            </span>
          </div>
          <div className="flex items-stretch gap-2">
            <input
              id="advanced-seed-input"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={seedValue ?? ''}
              onChange={(e) => handleSeedInput(e.target.value)}
              placeholder={t('seedPlaceholder')}
              className="flex-1 rounded-lg border border-border/60 bg-background/60 px-3 py-1.5 font-mono text-sm focus:border-primary/40 focus:outline-none"
              aria-describedby="advanced-seed-hint"
            />
            <button
              type="button"
              onClick={randomiseSeed}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/60 px-3 py-1.5 text-2xs font-medium text-foreground transition-colors hover:bg-muted"
              aria-label={t('seedRandomAria')}
              title={t('seedRandomAria')}
            >
              <Dices className="size-3.5" aria-hidden />
              {t('seedRandom')}
            </button>
          </div>
          <p
            id="advanced-seed-hint"
            className="mt-1.5 text-2xs leading-relaxed text-muted-foreground/70"
          >
            {t('seedHint')}
          </p>
        </div>

        {/* Negative prompt */}
        <div>
          <label
            htmlFor="advanced-negative-input"
            className="mb-2 block text-2xs font-medium text-muted-foreground/70"
          >
            {t('negativePromptLabel')}
          </label>
          <textarea
            id="advanced-negative-input"
            value={negativePrompt}
            onChange={(e) => setNegative(e.target.value)}
            placeholder={t('negativePromptPlaceholder')}
            rows={3}
            className="min-h-16 w-full rounded-lg border border-border/60 bg-background/60 p-2 text-sm focus:border-primary/40 focus:outline-none"
          />
          <p className="mt-1.5 text-2xs leading-relaxed text-muted-foreground/70">
            {t('negativePromptHint')}
          </p>
        </div>
      </div>
    )
  },
)
