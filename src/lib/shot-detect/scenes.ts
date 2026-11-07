import {
  SHOT_DETECT_GRAINS,
  SHOT_DETECT_MODEL,
  SHOT_DETECT_THRESHOLDS,
  type ShotDetectGrain,
} from '@/constants/shot-detect'

/**
 * 切镜的纯算法部分 —— 分窗、拼预测、阈值成镜、帧号换秒。没有 ort、没有解码，
 * 全部可单测；后台线程（`shot-detect.worker.ts`）只负责把帧喂进来、把概率接出去。
 *
 * 逐行对照上游 TransNetV2 的 `predict_frames` / `predictions_to_scenes`
 * （github.com/soCzech/TransNetV2/blob/master/inference/transnetv2.py），
 * 2026-11-07 用 Python 版在 5 段样片首尾相接上核过：切点与真实拼接点逐帧对上。
 */

const { windowFrames, stepFrames, contextFrames } = SHOT_DETECT_MODEL

/**
 * 流式分窗器。上游的做法是「先把整片读进内存，前补 25 帧首帧、后补到 50 的整数倍
 * 再加 25 帧尾帧，然后 100 帧一窗、步长 50 地扫」。这里一帧一帧地推，窗一满就吐，
 * 片尾再按同样的规则补齐 —— 吐出来的窗与上游逐帧相同，但内存里最多只压 100 帧。
 *
 * 帧本身不复制，窗里放的是同一个引用（补帧就是同一帧重复出现）。
 */
export class ShotDetectWindower<Frame> {
  private buffer: Frame[] = []
  private pushed = 0
  private emitted = 0
  private last: Frame | undefined

  /** 推一帧，返回因此凑满的窗（0 或 1 个）。 */
  push(frame: Frame): Frame[][] {
    if (this.pushed === 0) {
      for (let i = 0; i < contextFrames; i += 1) this.buffer.push(frame)
    }
    this.buffer.push(frame)
    this.pushed += 1
    this.last = frame
    return this.drain(false)
  }

  /** 片子读完：按上游规则补尾帧，吐出剩下的窗。 */
  finish(): Frame[][] {
    return this.drain(true)
  }

  /** 已推入的真实帧数。 */
  get frameCount(): number {
    return this.pushed
  }

  private drain(final: boolean): Frame[][] {
    const out: Frame[][] = []
    const total = final ? windowCountFor(this.pushed) : Number.POSITIVE_INFINITY
    while (this.emitted < total) {
      if (this.buffer.length < windowFrames) {
        if (!final || this.last === undefined) break
        while (this.buffer.length < windowFrames) this.buffer.push(this.last)
      }
      out.push(this.buffer.slice(0, windowFrames))
      this.buffer = this.buffer.slice(stepFrames)
      this.emitted += 1
    }
    return out
  }
}

/**
 * 抽帧时刻：从首帧时间戳起每 1/fps 秒一个，到片尾为止（不含片尾）。交给解码器的
 * `canvasesAtTimestamps`，它在每个时刻给「那一刻正在显示的帧」—— 所以记下来的切点
 * 时间仍是真实帧的时间戳，只是相邻两帧之间隔 1/fps 秒，切点最多晚 1/fps 秒。
 */
export function sampleTimestamps(
  firstSec: number,
  endSec: number,
  fps: number,
): number[] {
  const out: number[] = []
  if (!(fps > 0)) return out
  for (let i = 0; ; i += 1) {
    const sec = firstSec + i / fps
    if (sec >= endSec) break
    out.push(sec)
  }
  return out
}

/** n 帧的片子一共要跑几窗（上游补齐规则的闭式）。 */
export function windowCountFor(frameCount: number): number {
  if (frameCount <= 0) return 0
  const remainder = frameCount % stepFrames || stepFrames
  return 1 + (frameCount - remainder) / stepFrames
}

/**
 * 把每窗的输出（长度 100）拼成整片的逐帧概率：每窗只取中间 [25, 75)，最后截到 n 帧。
 */
export function stitchWindowPredictions(
  windows: readonly ArrayLike<number>[],
  frameCount: number,
): Float32Array {
  const out = new Float32Array(frameCount)
  let cursor = 0
  for (const window of windows) {
    for (
      let i = contextFrames;
      i < contextFrames + stepFrames && cursor < frameCount;
      i += 1
    ) {
      out[cursor] = window[i] ?? 0
      cursor += 1
    }
  }
  return out
}

/**
 * 上游 `predictions_to_scenes` 的逐行移植：返回每镜的 [首帧, 末帧]（含两端）。
 * 切点帧（概率过阈值的那一帧）算在**上一镜**的末尾；连续多帧过阈值（渐变）时，
 * 下一镜从第一个回落到阈值以下的帧开始。
 */
export function predictionsToScenes(
  predictions: ArrayLike<number>,
  threshold: number,
): Array<[number, number]> {
  const n = predictions.length
  if (n === 0) return []
  const scenes: Array<[number, number]> = []
  let previous = 0
  let start = 0
  let current = 0
  for (let i = 0; i < n; i += 1) {
    current = (predictions[i] ?? 0) > threshold ? 1 : 0
    if (previous === 1 && current === 0) start = i
    if (previous === 0 && current === 1 && i !== 0) scenes.push([start, i])
    previous = current
  }
  if (current === 0) scenes.push([start, n - 1])
  if (scenes.length === 0) return [[0, n - 1]]
  return scenes
}

/** 一镜在参考片上的时间段（秒）。 */
export interface ShotDetectRange {
  startSec: number
  endSec: number
}

/**
 * 帧号换成首尾相接的时间段：第 k 镜从它首帧的时间戳开始，到下一镜首帧的时间戳为止；
 * 第一镜从 0 开始，最后一镜到片尾。渐变转场那几帧因此归上一镜 —— 表里的镜头
 * 必须首尾相接，拼回去才是原片的长度。
 *
 * 时间戳用解码器给的逐帧值（可变帧率的片子也对），不按帧率反推。
 */
export function scenesToRanges(
  scenes: ReadonlyArray<readonly [number, number]>,
  timestamps: ArrayLike<number>,
  durationSec: number,
): ShotDetectRange[] {
  return scenes.map(([start], index) => {
    const next = scenes[index + 1]
    const startSec = index === 0 ? 0 : (timestamps[start] ?? 0)
    const endSec = next ? (timestamps[next[0]] ?? durationSec) : durationSec
    return { startSec: roundMs(startSec), endSec: roundMs(endSec) }
  })
}

/** 三档粗细各切出几镜 —— 粗细切换只换阈值，不重跑模型。 */
export function countShotsByGrain(
  predictions: ArrayLike<number>,
): Record<ShotDetectGrain, number> {
  const counts = {} as Record<ShotDetectGrain, number>
  for (const grain of SHOT_DETECT_GRAINS) {
    counts[grain] = predictionsToScenes(
      predictions,
      SHOT_DETECT_THRESHOLDS[grain],
    ).length
  }
  return counts
}

/** 某档粗细下的时间段。 */
export function rangesForGrain(
  predictions: ArrayLike<number>,
  timestamps: ArrayLike<number>,
  durationSec: number,
  grain: ShotDetectGrain,
): ShotDetectRange[] {
  return scenesToRanges(
    predictionsToScenes(predictions, SHOT_DETECT_THRESHOLDS[grain]),
    timestamps,
    durationSec,
  )
}

/** 秒数统一到毫秒 —— 截帧 URL 只认整数毫秒，存进镜头的也一样。 */
function roundMs(sec: number): number {
  return Math.round(sec * 1000) / 1000
}
