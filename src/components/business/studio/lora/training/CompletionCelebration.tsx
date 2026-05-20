'use client'

import { useRouter } from 'next/navigation'
import { CheckCircle2, ImageIcon, RotateCcw, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { LoraTrainingRecord } from '@/types'
import { cn } from '@/lib/utils'

export interface CompletionCelebrationProps {
  job: LoraTrainingRecord
  /** Reset the form to start a new training. */
  onTrainAnother: () => void
  /** Dismiss without resetting (X close action). */
  onDismiss: () => void
  className?: string
}

/**
 * "Your LoRA is ready" ritual. Renders only when a job hits COMPLETED.
 * Two primary actions:
 *
 *   1. "去使用" — pushes `/studio/image?activateLora=<id>` so the StudioPage
 *      can auto-activate the freshly-trained LoRA in the image tool.
 *      The StudioPage uses a ref-guarded effect to add it once then
 *      strips the query so a refresh doesn't re-add.
 *
 *   2. "训练新的" — calls onTrainAnother to reset the form and let the
 *      user kick off another job.
 *
 * The dismiss X just hides this block — the job is still in the sidebar
 * history, so the user hasn't lost anything by dismissing.
 */
export function CompletionCelebration({
  job,
  onTrainAnother,
  onDismiss,
  className,
}: CompletionCelebrationProps) {
  const router = useRouter()
  const t = useTranslations('LoraTraining')

  // Land the user on /studio/image with the trained LoRA pre-activated.
  // LoraStackProvider already resolves `?style=<code>` on mount — this
  // reuses the shared-link infrastructure rather than introducing a new
  // query shape. styleCode lands on the COMPLETED transition via the
  // listing query's loraAsset include; in the unlikely race where it
  // hasn't yet, just push to the canvas and let the user pick from the
  // sidebar.
  const handleUse = () => {
    const path = job.loraStyleCode
      ? `/studio/image?style=${encodeURIComponent(job.loraStyleCode)}`
      : '/studio/image'
    router.push(path)
  }

  return (
    <section
      role="status"
      aria-live="polite"
      className={cn(
        'relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-primary/5 to-transparent p-5 shadow-sm',
        className,
      )}
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t('completionDismiss')}
        className="absolute right-3 top-3 rounded-full p-1 text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
      >
        <span aria-hidden>×</span>
      </button>

      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-5" aria-hidden />
        </div>
        <div className="min-w-0 space-y-1">
          <h3 className="font-display text-base font-semibold tracking-tight text-foreground">
            {t('completionTitle')}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t('completionBody', { name: job.name })}
          </p>
          {job.triggerWord ? (
            <p className="rounded-md bg-background/70 px-2 py-1 font-mono text-xs text-foreground">
              {t('completionTriggerHint', { triggerWord: job.triggerWord })}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleUse}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98]"
        >
          <ImageIcon className="size-3.5" aria-hidden />
          {t('completionCtaUse')}
        </button>
        <button
          type="button"
          onClick={onTrainAnother}
          className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-muted/40"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          {t('completionCtaAnother')}
        </button>
      </div>

      {/* Subtle sparkle accent — matches the design language's editorial
          motion (fade-in + translate, no neon glow). */}
      <Sparkles
        className="pointer-events-none absolute -right-2 -top-2 size-16 text-primary/10"
        aria-hidden
      />
    </section>
  )
}
