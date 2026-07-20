import {
  GENERATION_STAGE_PROGRESS,
  WAITING_ASYMPTOTE,
  WAITING_REDUCED_MOTION_PCT,
  type GeneratingStageKey,
} from '@/constants/generation-progress'

export type { GeneratingStageKey }

const LAST_STAGE =
  GENERATION_STAGE_PROGRESS[GENERATION_STAGE_PROGRESS.length - 1]

/** Which named stage `elapsedSeconds` currently falls in. */
export function getGeneratingStageKey(
  elapsedSeconds: number,
): GeneratingStageKey {
  const stage = GENERATION_STAGE_PROGRESS.find((s) => elapsedSeconds < s.endSec)
  return stage?.key ?? 'waiting'
}

function easeOutQuad(x: number): number {
  const clamped = Math.min(1, Math.max(0, x))
  return 1 - (1 - clamped) ** 2
}

/** 88 + 7 × (1 − e^(−(t−45)/40)) — creeps toward 95, never arrives. */
function waitingAsymptotePct(elapsedSeconds: number): number {
  const t = Math.max(0, elapsedSeconds - LAST_STAGE.endSec)
  const { basePct, spanPct, tauSeconds } = WAITING_ASYMPTOTE
  return basePct + spanPct * (1 - Math.exp(-t / tauSeconds))
}

/**
 * Estimated progress-% from elapsed time alone (no real backend signal) —
 * segmented easeOutQuad through `preparing → connecting → rendering`, then
 * an asymptotic creep during `waiting`.
 *
 * `reducedMotion` swaps the continuous curve for a discrete snap to the
 * current stage's end value (20 / 45 / 88 / 95) — no interpolation, no
 * asymptote, per the loading-language spec's reduced-motion contract.
 */
export function computeEstimatedGenerationProgress(
  elapsedSeconds: number,
  reducedMotion = false,
): { percent: number; stageKey: GeneratingStageKey } {
  const stageKey = getGeneratingStageKey(elapsedSeconds)

  if (stageKey === 'waiting') {
    return {
      percent: reducedMotion
        ? WAITING_REDUCED_MOTION_PCT
        : waitingAsymptotePct(elapsedSeconds),
      stageKey,
    }
  }

  const stage = GENERATION_STAGE_PROGRESS.find((s) => s.key === stageKey)
  if (!stage) return { percent: 0, stageKey }

  if (reducedMotion) {
    return { percent: stage.endPct, stageKey }
  }

  const x = (elapsedSeconds - stage.startSec) / (stage.endSec - stage.startSec)
  const percent =
    stage.startPct + (stage.endPct - stage.startPct) * easeOutQuad(x)
  return { percent, stageKey }
}

export interface ResolveGenerationProgressInput {
  elapsedSeconds: number
  /** 0-100 real progress signal (video polling, training jobs). Takes priority — zero visual fork. */
  realProgress?: number
  /** Forces the 100% "closing the frame" state regardless of elapsed/real values. */
  isComplete?: boolean
  reducedMotion?: boolean
}

/**
 * Single entry point `StudioGeneratingProgress` calls each tick. Real
 * progress (when present) drives the number directly; otherwise falls back
 * to the elapsed-time estimate. `isComplete` always wins (completion jump).
 */
export function resolveGenerationProgress({
  elapsedSeconds,
  realProgress,
  isComplete,
  reducedMotion = false,
}: ResolveGenerationProgressInput): {
  percent: number
  stageKey: GeneratingStageKey
} {
  if (isComplete) {
    return { percent: 100, stageKey: 'waiting' }
  }

  if (typeof realProgress === 'number' && Number.isFinite(realProgress)) {
    return {
      percent: Math.min(100, Math.max(0, realProgress)),
      stageKey: getGeneratingStageKey(elapsedSeconds),
    }
  }

  return computeEstimatedGenerationProgress(elapsedSeconds, reducedMotion)
}
