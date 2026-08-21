import { describe, expect, it } from 'vitest'

import {
  VIDEO_FRAME_LIMITS,
  VIDEO_FRAME_PLAN,
} from '@/constants/video-analysis'
import {
  findFramePlanMismatches,
  formatFrameTimestamp,
  planVideoFrames,
} from '@/lib/video-frame-plan'

describe('planVideoFrames —— 确定性抽帧计划', () => {
  it('⭐ 同一个视频 + 同一份参数 → 同一组帧（这条塌了整条线就没意义了）', () => {
    const first = planVideoFrames(123.456)
    const second = planVideoFrames(123.456)
    expect(second).toEqual(first)
    // 连跑十次也不许有一次不同 —— 随机采样正是这里要排除的东西。
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(planVideoFrames(123.456).entries).toEqual(first.entries)
    }
  })

  it('段中点：t_k = (k + 0.5) × duration / N，两头都不碰', () => {
    const plan = planVideoFrames(80, 8)
    expect(plan.entries.map((entry) => entry.timestampSeconds)).toEqual([
      5, 15, 25, 35, 45, 55, 65, 75,
    ])
    expect(plan.entries[0].timestampSeconds).toBeGreaterThan(0)
    expect(plan.entries.at(-1)?.timestampSeconds).toBeLessThan(80)
  })

  it('默认帧数与 8 张附件上限对齐，且带上策略版本', () => {
    const plan = planVideoFrames(60)
    expect(plan.frameCount).toBe(VIDEO_FRAME_PLAN.frameCount)
    expect(plan.planVersion).toBe(VIDEO_FRAME_PLAN.planVersion)
    expect(plan.strategy).toBe(VIDEO_FRAME_PLAN.strategy)
  })

  it('时间戳只保留到毫秒 —— 浮点尾差不许变成两组不同的请求', () => {
    for (const entry of planVideoFrames(1 / 3).entries) {
      const decimals = String(entry.timestampSeconds).split('.')[1] ?? ''
      expect(decimals.length).toBeLessThanOrEqual(
        VIDEO_FRAME_PLAN.timestampDecimals,
      )
    }
  })

  it('片长读不出来时给空计划而不是抛（坏容器不该炸掉整条链路）', () => {
    for (const duration of [Number.NaN, 0, -5, Number.POSITIVE_INFINITY]) {
      expect(planVideoFrames(duration).entries).toEqual([])
    }
  })
})

describe('findFramePlanMismatches —— 服务端复算核对', () => {
  const plan = planVideoFrames(80, 8)
  const onPlan = plan.entries.map((entry) => ({
    index: entry.index,
    timestampSeconds: entry.timestampSeconds,
  }))

  it('完全按计划走 → 零不匹配', () => {
    expect(findFramePlanMismatches(plan, onPlan)).toEqual([])
  })

  it('容差内的落点算通过（浏览器 seek 到的是最近的可解码帧）', () => {
    const nudged = onPlan.map((frame, index) =>
      index === 3
        ? {
            ...frame,
            timestampSeconds:
              frame.timestampSeconds +
              VIDEO_FRAME_LIMITS.timestampToleranceSeconds / 2,
          }
        : frame,
    )
    expect(findFramePlanMismatches(plan, nudged)).toEqual([])
  })

  it('超出容差 → 报出第几帧差多少，不只是一个布尔', () => {
    const drifted = onPlan.map((frame, index) =>
      index === 5 ? { ...frame, timestampSeconds: 12 } : frame,
    )
    const mismatches = findFramePlanMismatches(plan, drifted)
    expect(mismatches).toHaveLength(1)
    expect(mismatches[0]).toMatchObject({
      index: 5,
      expected: 55,
      received: 12,
    })
  })

  it('缺帧也算不匹配', () => {
    const mismatches = findFramePlanMismatches(plan, onPlan.slice(0, 7))
    expect(mismatches).toHaveLength(1)
    expect(mismatches[0].index).toBe(7)
  })
})

describe('formatFrameTimestamp', () => {
  it('给证据标题用的时分秒', () => {
    expect(formatFrameTimestamp(12.4)).toBe('0:12')
    expect(formatFrameTimestamp(75)).toBe('1:15')
    expect(formatFrameTimestamp(3725)).toBe('1:02:05')
  })
})
