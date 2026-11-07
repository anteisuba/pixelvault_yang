import { describe, expect, it } from 'vitest'

import {
  ShotDetectWindower,
  countShotsByGrain,
  predictionsToScenes,
  rangesForGrain,
  sampleTimestamps,
  scenesToRanges,
  stitchWindowPredictions,
  windowCountFor,
} from './scenes'

/** 上游 `predict_frames` 的批处理写法（整片进内存再补齐），当作对照答案。 */
function upstreamWindows(frames: number[]): number[][] {
  const n = frames.length
  const padEnd = 25 + 50 - (n % 50 !== 0 ? n % 50 : 50)
  const padded = [
    ...Array<number>(25).fill(frames[0]),
    ...frames,
    ...Array<number>(padEnd).fill(frames[n - 1]),
  ]
  const windows: number[][] = []
  for (let ptr = 0; ptr < padded.length - 50; ptr += 50) {
    windows.push(padded.slice(ptr, ptr + 100))
  }
  return windows
}

function streamWindows(frames: number[]): number[][] {
  const windower = new ShotDetectWindower<number>()
  const out: number[][] = []
  for (const frame of frames) out.push(...windower.push(frame))
  out.push(...windower.finish())
  return out
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i)

describe('ShotDetectWindower', () => {
  it.each([1, 2, 25, 49, 50, 51, 74, 75, 76, 99, 100, 101, 150, 449, 1000])(
    '%i 帧：流式吐出的窗与上游批处理逐帧相同',
    (n) => {
      const frames = range(n)
      expect(streamWindows(frames)).toEqual(upstreamWindows(frames))
      expect(windowCountFor(n)).toBe(upstreamWindows(frames).length)
    },
  )

  it('一帧没推就结束 = 一窗都不吐', () => {
    expect(new ShotDetectWindower<number>().finish()).toEqual([])
    expect(windowCountFor(0)).toBe(0)
  })

  it('边推边吐，内存里不压整片', () => {
    const windower = new ShotDetectWindower<number>()
    let early = 0
    for (const frame of range(400)) early += windower.push(frame).length
    // 400 帧：上游一共 8 窗，最后一窗要等片尾补帧，前面的都在推的过程中吐完
    expect(early).toBe(7)
    expect(windower.finish()).toHaveLength(1)
  })
})

describe('stitchWindowPredictions', () => {
  it('每窗只取中间 50 帧，拼起来按片长截断', () => {
    const frames = range(120)
    const windows = upstreamWindows(frames)
    // 用「这一格对应的真实帧号」当预测值：拼对了就是 0..119
    const outputs = windows.map((window) => window.map((frame) => frame))
    expect(Array.from(stitchWindowPredictions(outputs, 120))).toEqual(frames)
  })
})

describe('predictionsToScenes（上游逐行移植）', () => {
  it('没有切点 = 整片一镜', () => {
    expect(predictionsToScenes([0, 0, 0, 0], 0.5)).toEqual([[0, 3]])
  })

  it('单帧切点算在上一镜末尾', () => {
    expect(predictionsToScenes([0, 0, 0.9, 0, 0], 0.5)).toEqual([
      [0, 2],
      [3, 4],
    ])
  })

  it('连续多帧过阈值（渐变）：下一镜从回落后的第一帧开始', () => {
    expect(predictionsToScenes([0, 0.8, 0.9, 0.7, 0, 0], 0.5)).toEqual([
      [0, 1],
      [4, 5],
    ])
  })

  it('第 0 帧过阈值不算切点', () => {
    expect(predictionsToScenes([0.9, 0, 0, 0], 0.5)).toEqual([[1, 3]])
  })

  it('以过阈值收尾：最后那段不再单独成镜', () => {
    expect(predictionsToScenes([0, 0, 0.9, 0.9], 0.5)).toEqual([[0, 2]])
  })

  it('全部过阈值 = 退回整片一镜', () => {
    expect(predictionsToScenes([0.9, 0.9, 0.9], 0.5)).toEqual([[0, 2]])
  })

  it('空输入不成镜', () => {
    expect(predictionsToScenes([], 0.5)).toEqual([])
  })

  it('严格大于阈值才算（与上游 `p > th` 一致）', () => {
    expect(predictionsToScenes([0, 0.5, 0], 0.5)).toEqual([[0, 2]])
  })
})

describe('scenesToRanges', () => {
  it('首尾相接：第一镜从 0 起，下一镜首帧就是上一镜的终点，最后一镜到片尾', () => {
    const timestamps = range(10).map((i) => i * 0.1 + 0.02)
    expect(
      scenesToRanges(
        [
          [0, 3],
          [4, 6],
          [7, 9],
        ],
        timestamps,
        1.05,
      ),
    ).toEqual([
      { startSec: 0, endSec: 0.42 },
      { startSec: 0.42, endSec: 0.72 },
      { startSec: 0.72, endSec: 1.05 },
    ])
  })

  it('渐变那几帧归上一镜，不留空当', () => {
    const timestamps = range(6).map((i) => i * 0.5)
    expect(
      scenesToRanges(
        [
          [0, 1],
          [4, 5],
        ],
        timestamps,
        3,
      ),
    ).toEqual([
      { startSec: 0, endSec: 2 },
      { startSec: 2, endSec: 3 },
    ])
  })
})

describe('粗细三档', () => {
  // 一段 450 帧的片子：在 72 / 179 / 276 / 349 帧后各有一刀（样片实测的切点），
  // 另有一处 0.4 的闪光 —— 只有「细」档会把它也切开。
  const predictions = new Float32Array(450)
  for (const cut of [72, 179, 276, 349]) predictions[cut] = 0.95
  predictions[220] = 0.4
  const timestamps = Array.from({ length: 450 }, (_, i) => i / 30)

  it('只换阈值就能数出每档镜数', () => {
    expect(countShotsByGrain(predictions)).toEqual({
      fine: 6,
      normal: 5,
      coarse: 5,
    })
  })

  it('正常档的 5 镜首尾相接、加起来正好是片长', () => {
    const ranges = rangesForGrain(predictions, timestamps, 15, 'normal')
    expect(ranges).toHaveLength(5)
    expect(ranges[0]?.startSec).toBe(0)
    expect(ranges.at(-1)?.endSec).toBe(15)
    for (let i = 1; i < ranges.length; i += 1) {
      expect(ranges[i]?.startSec).toBe(ranges[i - 1]?.endSec)
    }
    expect(ranges[1]?.startSec).toBe(Math.round((73 / 30) * 1000) / 1000)
  })
})

describe('sampleTimestamps（每秒抽 N 帧的时刻）', () => {
  it('从首帧时间戳起每 1/fps 秒一个，不含片尾', () => {
    const at = sampleTimestamps(0, 1, 12)
    expect(at).toHaveLength(12)
    expect(at[0]).toBe(0)
    expect(at[1]).toBeCloseTo(1 / 12, 9)
    expect(at.at(-1)).toBeCloseTo(11 / 12, 9)
  })

  it('首帧不在 0 秒时整体往后挪，片尾照样不越界', () => {
    const at = sampleTimestamps(0.042, 16.7, 12)
    expect(at[0]).toBe(0.042)
    expect(at.every((sec) => sec < 16.7)).toBe(true)
    expect(at).toHaveLength(Math.ceil((16.7 - 0.042) * 12))
  })

  it('片长为零或帧率不合法 = 一个时刻都没有', () => {
    expect(sampleTimestamps(0, 0, 12)).toEqual([])
    expect(sampleTimestamps(2, 1, 12)).toEqual([])
    expect(sampleTimestamps(0, 10, 0)).toEqual([])
  })
})
