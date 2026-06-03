'use client'

import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'

type StepperStageKey = 'geometry' | 'texture' | 'complete'
type StepStatus = 'pending' | 'active' | 'done' | 'failed'

interface StageStepperBarProps {
  /**
   * Which stage is currently active. Drives the highlight + the elapsed
   * time chip rendered under it.
   */
  currentStage: StepperStageKey
  /** Per-stage status. Defaults derived from `currentStage` when omitted. */
  status?: Partial<Record<StepperStageKey, StepStatus>>
  /** Seconds since the user clicked Generate. Optional — hidden when 0. */
  totalElapsedSeconds?: number
  /** Optional message under the steps (e.g. "上传 64.2 / 120.3 MB"). */
  detail?: string | null
  className?: string
}

/**
 * PR3-α: bottom-of-canvas progress indicator for the staged 3D generation
 * flow. Three steps (geometry / texture / complete) with status + a total
 * elapsed counter. Mounts unconditionally inside Studio3DWorkspace's main
 * area; the caller decides when to hide it (e.g. when idle).
 *
 * Intentionally minimal — Studio3DWorkspace already conveys current stage
 * via the rendered model (grey mesh vs final GLB) and the decision dock.
 * The stepper is the "where am I in the multi-step flow" affordance, not a
 * primary status surface.
 */
export function StageStepperBar({
  currentStage,
  status,
  totalElapsedSeconds,
  detail,
  className,
}: StageStepperBarProps) {
  const t = useTranslations('Model3DGenerate')

  const resolvedStatus = (key: StepperStageKey): StepStatus => {
    if (status?.[key]) return status[key]!
    const order: StepperStageKey[] = ['geometry', 'texture', 'complete']
    const currentIdx = order.indexOf(currentStage)
    const idx = order.indexOf(key)
    if (idx < currentIdx) return 'done'
    if (idx === currentIdx) return 'active'
    return 'pending'
  }

  const steps: { key: StepperStageKey; label: string }[] = [
    { key: 'geometry', label: t('stepGeometry') },
    { key: 'texture', label: t('stepTexture') },
    { key: 'complete', label: t('stepComplete') },
  ]

  return (
    <div
      className={cn(
        'pointer-events-none flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-neutral-950/85 px-4 py-3 text-neutral-100 shadow-lg backdrop-blur-md',
        className,
      )}
      role="progressbar"
      aria-label={t('stageStepperLabel')}
    >
      <div className="flex w-full items-center gap-2">
        {steps.map((step, idx) => {
          const s = resolvedStatus(step.key)
          return (
            <div key={step.key} className="flex flex-1 items-center gap-2">
              <div
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium leading-none',
                  s === 'done' &&
                    'border-emerald-400 bg-emerald-400 text-neutral-900',
                  s === 'active' &&
                    'border-emerald-400 bg-emerald-400/20 text-emerald-300 animate-pulse',
                  s === 'pending' &&
                    'border-white/30 bg-transparent text-white/40',
                  s === 'failed' && 'border-red-400 bg-red-400/20 text-red-300',
                )}
              >
                {s === 'done' ? '✓' : s === 'failed' ? '✗' : idx + 1}
              </div>
              <span
                className={cn(
                  'text-xs font-medium tracking-wide',
                  s === 'pending' ? 'text-white/40' : 'text-white/90',
                )}
              >
                {step.label}
              </span>
              {idx < steps.length - 1 && (
                <span
                  className={cn(
                    'h-px flex-1 rounded-full transition-colors',
                    s === 'done' ? 'bg-emerald-400/70' : 'bg-white/15',
                  )}
                />
              )}
            </div>
          )
        })}
      </div>
      {(detail ||
        (totalElapsedSeconds !== undefined && totalElapsedSeconds > 0)) && (
        <div className="flex w-full items-center justify-between text-[10px] text-neutral-400">
          <span>{detail ?? ''}</span>
          {totalElapsedSeconds !== undefined && totalElapsedSeconds > 0 && (
            <span>
              {t('stepperTotalElapsed', { seconds: totalElapsedSeconds })}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
