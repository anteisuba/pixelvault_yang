import {
  GENERATION_EDGE_STROKE_PX,
  GENERATION_STAGE_PROGRESS,
  isExecutionProgressStage,
  WAITING_ASYMPTOTE,
  WAITING_REDUCED_MOTION_PCT,
  type ExecutionProgressStage,
  type GeneratingStageKey,
} from '@/constants/generation-progress'

export type { ExecutionProgressStage, GeneratingStageKey }

const LAST_STAGE =
  GENERATION_STAGE_PROGRESS[GENERATION_STAGE_PROGRESS.length - 1]

/** Which named stage `elapsedSeconds` currently falls in. */
export function getGeneratingStageKey(
  elapsedSeconds: number,
): GeneratingStageKey {
  const stage = GENERATION_STAGE_PROGRESS.find((s) => elapsedSeconds < s.endSec)
  return stage?.key ?? 'waiting'
}

/**
 * Stage label to show for a running job: a worker-reported execution stage
 * (runner queue / runner running) always wins over the elapsed-time guess,
 * because it is the only signal that separates "waiting for a cold GPU" from
 * "the GPU is drawing". Falls back to the time-derived stage when the job
 * reports nothing (every non-runner provider).
 */
export function resolveGeneratingStageKey(
  elapsedSeconds: number,
  executionStage?: ExecutionProgressStage | null,
  searchGrounding = false,
): GeneratingStageKey {
  if (isExecutionProgressStage(executionStage)) return executionStage
  const stageKey = getGeneratingStageKey(elapsedSeconds)
  return searchGrounding &&
    (stageKey === 'preparing' || stageKey === 'connecting')
    ? 'searching'
    : stageKey
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
 * asymptote, per the loading spec's reduced-motion contract
 * (docs/references/loading.md).
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
  /** Worker-reported stage (runner only today) — overrides the time-derived stage label. */
  executionStage?: ExecutionProgressStage | null
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
  executionStage,
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
      stageKey: resolveGeneratingStageKey(elapsedSeconds, executionStage),
    }
  }

  const estimated = computeEstimatedGenerationProgress(
    elapsedSeconds,
    reducedMotion,
  )
  return {
    ...estimated,
    stageKey: resolveGeneratingStageKey(elapsedSeconds, executionStage),
  }
}

/** 线压在盒子边外（与画布选中环重合，默认）还是收在边内（宿主裁切时）。 */
export type GenerationEdgePlacement = 'outside' | 'inside'

export interface GenerationEdgeBox {
  /** Layout width / height of the art box the line runs around (px). */
  width: number
  height: number
  /** The box's corner radius (px). */
  radius: number
}

/**
 * 加载态 A「边即进度」的那条路（owner 2026-09-27）：沿着卡片自己的边，**从上沿正中
 * 起顺时针一圈回到原点**。配 `pathLength={100}`，进度就是 `stroke-dasharray: p 100`。
 *
 * ⚠ 路径压在盒子**外侧**半个线宽：线的内沿贴着盒子边，与画布选中环
 *   （`outline` 1.5px、offset 0，画在边外）落在同一处 —— 线走满时就是那圈环，
 *   换过去看不出接缝。圆角跟着外扩半个线宽，与环的外轮廓同心。
 */
export function buildGenerationEdgePath(
  { width, height, radius }: GenerationEdgeBox,
  strokeWidth: number = GENERATION_EDGE_STROKE_PX,
  placement: GenerationEdgePlacement = 'outside',
): string {
  // `inside`：宿主整块裁切（手机镜头卡的外壳 `overflow-hidden`），边外那半圈会被
  // 裁掉 —— 线收进盒子里半个线宽，圆角同心内缩。
  const half = placement === 'outside' ? strokeWidth / 2 : -strokeWidth / 2
  const left = -half
  const top = -half
  const right = width + half
  const bottom = height + half
  const r = Math.max(
    0,
    Math.min(radius + half, (right - left) / 2, (bottom - top) / 2),
  )
  const n = (value: number) => Number(value.toFixed(2))
  const mid = n(width / 2)
  return [
    `M ${mid} ${n(top)}`,
    `H ${n(right - r)}`,
    `A ${n(r)} ${n(r)} 0 0 1 ${n(right)} ${n(top + r)}`,
    `V ${n(bottom - r)}`,
    `A ${n(r)} ${n(r)} 0 0 1 ${n(right - r)} ${n(bottom)}`,
    `H ${n(left + r)}`,
    `A ${n(r)} ${n(r)} 0 0 1 ${n(left)} ${n(bottom - r)}`,
    `V ${n(top + r)}`,
    `A ${n(r)} ${n(r)} 0 0 1 ${n(left + r)} ${n(top)}`,
    `H ${mid}`,
  ].join(' ')
}
