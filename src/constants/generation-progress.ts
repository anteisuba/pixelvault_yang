/**
 * Generation-in-progress "framed reveal" — hybrid stage/asymptote progress
 * constants shared by every single-shot generation surface (image / video /
 * audio) in Studio.
 *
 * Spec: docs/plans/generating-progress-2026-07.md (algorithm skeleton) +
 *       docs/plans/loading-language-2026-07.md §2-§3 (visual + landing list).
 *
 * NOT used by `StudioSceneProgress` (multi-shot / training real-progress —
 * out of scope, stays on shadcn `Progress`).
 */

export type GeneratingStageKey =
  | 'preparing'
  | 'connecting'
  | 'rendering'
  | 'waiting'

interface GenerationStageProgressStep {
  key: Exclude<GeneratingStageKey, 'waiting'>
  startSec: number
  endSec: number
  startPct: number
  endPct: number
}

/**
 * Elapsed-time → progress-% segments. Each segment is walked with an
 * easeOutQuad curve (see `computeEstimatedGenerationProgress` in
 * `src/lib/generation-progress.ts`); segments share endpoints so stage
 * transitions never jump.
 */
export const GENERATION_STAGE_PROGRESS: readonly GenerationStageProgressStep[] =
  [
    { key: 'preparing', startSec: 0, endSec: 2, startPct: 0, endPct: 20 },
    { key: 'connecting', startSec: 2, endSec: 8, startPct: 20, endPct: 45 },
    { key: 'rendering', startSec: 8, endSec: 45, startPct: 45, endPct: 88 },
  ]

/**
 * Past the last stage's `endSec` (45s), progress creeps along an asymptote
 * toward `basePct + spanPct` (88 + 7 = 95%) and never reaches it —
 * `waiting` is allowed to run indefinitely.
 */
export const WAITING_ASYMPTOTE = {
  basePct: 88,
  spanPct: 7,
  tauSeconds: 40,
} as const

/** Discrete end-value the `waiting` stage snaps to under reduced motion. */
export const WAITING_REDUCED_MOTION_PCT = 95

/** JS recompute cadence for the progress readout (dashoffset + digits). */
export const PROGRESS_TICK_MS = 500

/**
 * Stage-word crossfade: outgoing label unmount delay. Must match the
 * `studio-generation-stage-out` animation duration in globals.css (120ms).
 */
export const STAGE_LABEL_CROSSFADE_OUT_MS = 120

/** CSS transition durations for the "closing the frame" completion beat. */
export const GENERATION_COMPLETE_ANIMATION = {
  /** stroke-dashoffset → 0, var(--ease-standard) */
  closeMs: 260,
  /** pause once the frame is closed, before the whole chrome fades */
  holdMs: 140,
  /** chrome (frame + digits + params row) opacity fade, overlaps image-in */
  fadeMs: 320,
} as const

export const GENERATION_COMPLETE_TOTAL_MS =
  GENERATION_COMPLETE_ANIMATION.closeMs +
  GENERATION_COMPLETE_ANIMATION.holdMs +
  GENERATION_COMPLETE_ANIMATION.fadeMs
