/**
 * 角色出门逛的纯逻辑：截止时刻、她在意的东西加减、额度表、网址规整。
 * 逛一轮 / 看视频的整条路见 `character-browse.int.test.ts`（真库 + 假外网）。
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { CHARACTER_OUTING } from '@/constants/character-browse'

import {
  estimateCallTokens,
  nextInterests,
  normalizeOutingSite,
  OutingBudgetExhausted,
  OutingClock,
  OutingMeter,
  OutingTimeSlice,
} from './character-browse.service'

describe('OutingClock（一段的截止时刻）', () => {
  it('每一步的超时截到截止时刻；剩下不到一步的时间就交给下一段', () => {
    const far = new OutingClock(Date.now() + 10 * 60_000)
    expect(far.signal(60_000).aborted).toBe(false)
    const near = new OutingClock(Date.now() + CHARACTER_OUTING.minStepMs - 1)
    expect(() => near.signal(60_000)).toThrow(OutingTimeSlice)
  })
})

describe('nextInterests（她在意的东西加减一次）', () => {
  it('去掉只认原样的、加的去重截短、封顶', () => {
    expect(
      nextInterests(['水彩', '猫'], {
        add: ['猫', '  胶片  '],
        drop: ['水彩'],
      }),
    ).toEqual(['猫', '胶片'])
    expect(nextInterests(['水彩'], { add: ['a', 'b', 'c'], drop: [] })).toEqual(
      ['水彩', 'a', 'b'],
    )
    expect(nextInterests(['水彩'], { add: [], drop: ['不在单上'] })).toBeNull()
    expect(nextInterests(['水彩'], null)).toBeNull()
  })
})

describe('额度表与网址', () => {
  it('估一次调用按字数 + 每张图 + 回答那份', () => {
    expect(
      estimateCallTokens({ systemPrompt: 'abc', userPrompt: 'de', images: 2 }),
    ).toBe(5 + 2 * 1600 + 1500)
  })

  it('估得超了就抛，实扣累加', () => {
    const meter = new OutingMeter(10_000, 9_000)
    expect(() => meter.ensure(1_001)).toThrow(OutingBudgetExhausted)
    meter.ensure(1_000)
    meter.charge(400)
    expect(meter.remaining()).toBe(600)
    expect(meter.calls).toBe(1)
  })

  it('你添加的网址规整成域名，认不出的丢掉', () => {
    expect(normalizeOutingSite('https://www.pixiv.net/ranking')).toBe(
      'pixiv.net',
    )
    expect(normalizeOutingSite('zhihu.com')).toBe('zhihu.com')
    expect(normalizeOutingSite('不是网址')).toBeNull()
    expect(normalizeOutingSite('')).toBeNull()
  })
})
