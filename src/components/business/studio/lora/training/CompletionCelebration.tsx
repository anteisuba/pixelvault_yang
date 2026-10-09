'use client'

import { useRouter } from 'next/navigation'
import { CheckCircle2, ImageIcon, RotateCcw } from '@/components/icons'
import { useTranslations } from 'next-intl'

import type { LoraTrainingRecord } from '@/types'
import { Button } from '@/components/ui/button'
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
        // 白卡 + 细边（站内白底中性灰），⛔ 渐变 / 闪光装饰：完成的信号交给绿勾。
        'relative overflow-hidden rounded-2xl border border-border bg-card p-5',
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
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-status-applied-surface text-status-applied">
          <CheckCircle2 className="size-5" aria-hidden />
        </div>
        <div className="min-w-0 space-y-1">
          <h3 className="text-base font-semibold tracking-tight text-foreground">
            {t('completionTitle')}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t('completionBody', { name: job.name })}
          </p>
          {job.triggerWord ? (
            <p className="rounded-md bg-muted px-2 py-1 text-xs text-foreground">
              {t('completionTriggerHint', { triggerWord: job.triggerWord })}
            </p>
          ) : null}
        </div>
      </div>

      {/* 主动作黑丸 + 次动作 ghost，同空态（ui-defaults §7）。 */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button className="rounded-full" onClick={handleUse}>
          <ImageIcon className="size-3.5" aria-hidden />
          {t('completionCtaUse')}
        </Button>
        <Button
          variant="ghost"
          className="rounded-full"
          onClick={onTrainAnother}
        >
          <RotateCcw className="size-3.5" aria-hidden />
          {t('completionCtaAnother')}
        </Button>
      </div>
    </section>
  )
}
