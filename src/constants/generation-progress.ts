/**
 * Generation-in-progress "framed reveal" — hybrid stage/asymptote progress
 * constants shared by every single-shot generation surface (image / video /
 * audio) in Studio.
 *
 * Spec: docs/references/loading.md (algorithm skeleton + visual).
 *
 * NOT used by `StudioSceneProgress` (multi-shot / training real-progress —
 * out of scope, stays on shadcn `Progress`).
 */

/**
 * Worker-reported execution stages — a real backend signal, unlike the
 * elapsed-time stages below. Today only the runner (self-hosted RunPod
 * ComfyUI) path reports them: a runner job sitting in `IN_QUEUE` is waiting
 * for a cold GPU + a 6.9GB checkpoint load, which elapsed time alone cannot
 * tell apart from "nobody picked the job up".
 *
 * Values double as the `StudioV3.generatingOverlayStages.*` message keys.
 */
export const EXECUTION_PROGRESS_STAGES = {
  RUNNER_QUEUED: 'runnerQueued',
  RUNNER_RUNNING: 'runnerRunning',
  /**
   * 幻影名额自愈（2026-09-12）：端点声称有 worker 却零活跃、作业卡在队列里，
   * worker 先回收端点 worker 再重排一次，而不是直接取消。这一档就是那段
   * 回收窗口的用户可见解释 —— 没有它，界面只能继续显示 runnerQueued，
   * 而实际发生的是「正在重启端点」。
   */
  RUNNER_RECYCLING: 'runnerRecycling',
} as const

export type ExecutionProgressStage =
  (typeof EXECUTION_PROGRESS_STAGES)[keyof typeof EXECUTION_PROGRESS_STAGES]

export const EXECUTION_PROGRESS_STAGE_VALUES = Object.values(
  EXECUTION_PROGRESS_STAGES,
) as [ExecutionProgressStage, ...ExecutionProgressStage[]]

export function isExecutionProgressStage(
  value: unknown,
): value is ExecutionProgressStage {
  return EXECUTION_PROGRESS_STAGE_VALUES.some((stage) => stage === value)
}

export type GeneratingStageKey =
  | 'preparing'
  | 'connecting'
  | 'rendering'
  | 'waiting'
  /**
   * 「先搜再画」那一枪的前两段（准备 + 连接）换成这个词：搜索与出图是同一次
   * 调用，中途没有信号可分，阶段词照旧按已用时长猜（与 preparing → connecting
   * 同一条时间线）。
   */
  | 'searching'
  | ExecutionProgressStage

interface GenerationStageProgressStep {
  key: 'preparing' | 'connecting' | 'rendering'
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

/**
 * Completion beat of 加载态 A「边即进度」(owner 2026-09-27, design canvas
 * 「加载态 A · 全部状态」): the line fills up and closes on the card's edge,
 * holds a beat, then the chrome fades while the media blurs in underneath.
 */
export const GENERATION_COMPLETE_ANIMATION = {
  /** the edge line runs to 100% and closes — linear, like the progress itself */
  closeMs: 240,
  /** pause once the line is closed, before the chrome leaves */
  holdMs: 140,
  /** line + digits fade; on a selected canvas card the ring is already there underneath */
  fadeMs: 200,
} as const

/**
 * Width of the progress line — the same as the canvas node's selected ring
 * (`node-selected-ring`, 1.5px), so a full line lands exactly on the ring.
 */
export const GENERATION_EDGE_STROKE_PX = 1.5

/**
 * A box narrower than this shows only the percent (the stage word goes to
 * screen readers). Same threshold as `--container-4xs` in globals.css — the
 * CSS side is a container query; the canvas side has to compute it from the
 * zoom, because the canvas scales with a transform.
 */
export const GENERATION_NARROW_BOX_PX = 160

export const GENERATION_COMPLETE_TOTAL_MS =
  GENERATION_COMPLETE_ANIMATION.closeMs +
  GENERATION_COMPLETE_ANIMATION.holdMs +
  GENERATION_COMPLETE_ANIMATION.fadeMs
