import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  affordableSeconds,
  pickFrames,
  videoWatchTokens,
} from './character-outing-video.service'

describe('出门看视频的估算与分帧', () => {
  it('按秒估 token：每帧 258 + 每秒声音 32；额度够看几秒', () => {
    expect(videoWatchTokens(100, 1)).toBe(29_000)
    expect(videoWatchTokens(100, 0.5)).toBe(16_100)
    expect(affordableSeconds(29_000, 1)).toBe(100)
    // 连 20 秒都不够就不看。
    expect(affordableSeconds(5_000, 1)).toBe(0)
  })

  it('分帧在时间段里均匀挑，按时间顺序', () => {
    const times = Array.from({ length: 100 }, (_, n) => n * 6)
    expect(pickFrames(times, 4)).toEqual([0, 25, 50, 75])
    expect(pickFrames(times, 24, 60, 90)).toEqual([10, 11, 12, 13, 14, 15])
  })
})
