import { describe, expect, it } from 'vitest'

import { HOME_V4_BEATS, HOME_V4_SCROLL } from '@/constants/homepage-v4'

import {
  countAt,
  flagAt,
  homeV4AudioBeats,
  homeV4CanvasBeats,
  homeV4ImageBeats,
  homeV4LoraBeats,
  homeV4OpeningBeats,
  homeV4VaultBeats,
  homeV4VideoBeats,
  spanAt,
} from './home-v4-beats'

/**
 * 四个取样点是 UX 板给的骨架：**0.0 空态 · 0.3 输入完 · 0.7 出图 · 1.0 结果 +
 * CTA**。每段都在这四点上钉一次，所以任何人改关键帧表都必须回来说明它改成了
 * 什么——表不是随手可以动的装饰。
 */
const SAMPLES = [0, 0.3, 0.7, 1] as const

describe('scrub 求值原语', () => {
  it('区间外分别是 0 与 1，区间内线性', () => {
    expect(spanAt(0, [0.2, 0.6])).toBe(0)
    expect(spanAt(0.2, [0.2, 0.6])).toBe(0)
    expect(spanAt(0.4, [0.2, 0.6])).toBeCloseTo(0.5, 6)
    expect(spanAt(0.9, [0.2, 0.6])).toBe(1)
  })

  it('依次落位：区间起点落下第一个，终点全部落齐', () => {
    expect(countAt(0.1, [0.2, 0.6], 4)).toBe(0)
    expect(countAt(0.2, [0.2, 0.6], 4)).toBe(0)
    expect(countAt(0.21, [0.2, 0.6], 4)).toBe(1)
    expect(countAt(0.4, [0.2, 0.6], 4)).toBe(3)
    expect(countAt(0.6, [0.2, 0.6], 4)).toBe(4)
    expect(countAt(1, [0.2, 0.6], 4)).toBe(4)
  })

  it('阈值本身算过；进度算不出来时停在空态', () => {
    expect(flagAt(0.5, 0.5)).toBe(true)
    expect(flagAt(0.49, 0.5)).toBe(false)
    expect(homeV4ImageBeats(Number.NaN)).toEqual({
      typed: 0,
      tiles: 0,
      cta: false,
    })
  })

  it('降级进度是结果态，不是空态', () => {
    expect(HOME_V4_SCROLL.REST_PROGRESS).toBe(1)
    expect(HOME_V4_SCROLL.JUMP_PROGRESS).toBe(1)
    /* 目录 / 键盘跳段落在 1.0 上，等于每段的结果态。 */
    expect(homeV4ImageBeats(HOME_V4_SCROLL.JUMP_PROGRESS).cta).toBe(true)
    expect(homeV4LoraBeats(HOME_V4_SCROLL.JUMP_PROGRESS).cta).toBe(true)
    expect(homeV4AudioBeats(HOME_V4_SCROLL.JUMP_PROGRESS).cta).toBe(true)
    expect(homeV4VideoBeats(HOME_V4_SCROLL.JUMP_PROGRESS).cta).toBe(true)
    expect(homeV4CanvasBeats(HOME_V4_SCROLL.JUMP_PROGRESS).cta).toBe(true)
    expect(homeV4VaultBeats(HOME_V4_SCROLL.JUMP_PROGRESS).cta).toBe(true)
  })
})

describe('01 图片 · 关键帧表', () => {
  it('0 / 0.3 / 0.7 / 1.0', () => {
    expect(SAMPLES.map(homeV4ImageBeats)).toEqual([
      { typed: 0, tiles: 0, cta: false },
      { typed: 1, tiles: 0, cta: false },
      { typed: 1, tiles: 3, cta: false },
      { typed: 1, tiles: 4, cta: true },
    ])
  })
})

describe('02 LoRA · 关键帧表', () => {
  it('0 / 0.3 / 0.7 / 1.0', () => {
    expect(SAMPLES.map(homeV4LoraBeats)).toEqual([
      { mounted: 0, triggers: 0, outs: 0, cta: false },
      { mounted: 5, triggers: 3, outs: 0, cta: false },
      { mounted: 5, triggers: 3, outs: 3, cta: false },
      { mounted: 5, triggers: 3, outs: 4, cta: true },
    ])
  })
})

describe('03 声音 · 关键帧表', () => {
  it('0 / 0.3 / 0.7 / 1.0', () => {
    expect(SAMPLES.map(homeV4AudioBeats)).toEqual([
      { arrived: 0, played: 0, compose: false, cta: false },
      { arrived: 3, played: 2, compose: false, cta: false },
      { arrived: 3, played: 3, compose: true, cta: false },
      { arrived: 3, played: 3, compose: true, cta: true },
    ])
  })

  it('波形永远不早于它所属的气泡', () => {
    for (let p = 0; p <= 1.0001; p += 0.01) {
      const beats = homeV4AudioBeats(p)
      expect(beats.played).toBeLessThanOrEqual(beats.arrived)
    }
  })
})

describe('04 视频 · 关键帧表', () => {
  it('0 / 0.3 / 0.7 / 1.0', () => {
    expect(SAMPLES.map(homeV4VideoBeats)).toEqual([
      { pills: 0, typed: 0, send: false, out: false, cta: false },
      { pills: 3, typed: 1, send: false, out: false, cta: false },
      { pills: 3, typed: 1, send: true, out: true, cta: false },
      { pills: 3, typed: 1, send: true, out: true, cta: true },
    ])
  })

  it('成片不会早于发送键', () => {
    expect(HOME_V4_BEATS.video.out).toBeGreaterThan(HOME_V4_BEATS.video.send)
  })
})

describe('05 画布 · 关键帧表', () => {
  it('0 / 0.3 / 0.7 / 1.0', () => {
    const steps = SAMPLES.map((p) => homeV4CanvasBeats(p))
    expect(steps[0]).toEqual({ step: 0, cut: false, cta: false })
    expect(steps[1].step).toBeCloseTo(0.588, 3)
    expect(steps[2].step).toBeCloseTo(1.529, 3)
    expect(steps[3]).toEqual({ step: 2, cut: true, cta: true })
  })

  it('成片只在第三步坐稳之后才放', () => {
    expect(homeV4CanvasBeats(0.9).cut).toBe(true)
    expect(homeV4CanvasBeats(0.85).cut).toBe(false)
  })
})

describe('06 资源库 · 关键帧表', () => {
  it('0 / 0.3 / 0.7 / 1.0', () => {
    const beats = SAMPLES.map(homeV4VaultBeats)
    expect(
      beats.map((beat) => ({
        arrivals: beat.arrivals,
        rest: beat.rest,
        lift: beat.lift,
        cta: beat.cta,
      })),
    ).toEqual([
      { arrivals: 0, rest: 0, lift: false, cta: false },
      { arrivals: 3, rest: 7, lift: false, cta: false },
      { arrivals: 3, rest: 7, lift: true, cta: false },
      { arrivals: 3, rest: 7, lift: true, cta: true },
    ])
    /* 复用位是连续量：0.7 处刚好填了四分之三。 */
    expect(beats.map((beat) => beat.slot)).toEqual([
      0,
      0,
      expect.closeTo(0.75, 6),
      1,
    ])
  })
})

describe('开场 · 作品墙散开', () => {
  it('0 / 0.3 / 0.7 / 1.0', () => {
    expect(homeV4OpeningBeats(0)).toEqual({ spread: 0, copyOpacity: 1 })
    expect(homeV4OpeningBeats(0.3).spread).toBeCloseTo(0.3, 6)
    expect(homeV4OpeningBeats(0.3).copyOpacity).toBe(1)
    expect(homeV4OpeningBeats(0.7).copyOpacity).toBeCloseTo(1 - 0.538, 3)
    expect(homeV4OpeningBeats(1)).toEqual({ spread: 1, copyOpacity: 0 })
  })
})
