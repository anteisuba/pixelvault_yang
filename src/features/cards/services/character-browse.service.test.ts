/**
 * 角色出门逛的纯逻辑：截止时刻、她在意的东西加减、额度表、网址规整。
 * 逛一轮 / 看视频的整条路见 `character-browse.int.test.ts`（真库 + 假外网）。
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { CHARACTER_OUTING } from '@/constants/character-browse'

import {
  estimateCallTokens,
  interestWorkKey,
  nextInterests,
  normalizeOutingSite,
  OutingBudgetExhausted,
  OutingClock,
  OutingMeter,
  OutingTimeSlice,
} from './character-browse.service'

/** 真实长度的 BV 号（BV + 10 位）。 */
function bv(n: number) {
  return `BV1aaaaaaaa${n}`
}

describe('OutingClock（一段的截止时刻）', () => {
  it('每一步的超时截到截止时刻；剩下不到一步的时间就交给下一段', () => {
    const far = new OutingClock(Date.now() + 10 * 60_000)
    expect(far.signal(60_000).aborted).toBe(false)
    const near = new OutingClock(Date.now() + CHARACTER_OUTING.minStepMs - 1)
    expect(() => near.signal(60_000)).toThrow(OutingTimeSlice)
  })
})

describe('nextInterests（她在意的东西加减一次）', () => {
  const two = [
    { url: `https://www.bilibili.com/video/${bv(1)}` },
    { url: 'https://danbooru.donmai.us/posts/123' },
  ]
  const add = (text: string, from = [1, 2]) => ({ text, from })

  it('去掉只认原样的、加的去重截短、封顶', () => {
    expect(
      nextInterests(
        ['水彩', '猫'],
        { add: [add('猫'), add('  胶片  ')], drop: ['水彩'] },
        two,
      ),
    ).toEqual(['猫', '胶片'])
    expect(
      nextInterests(
        ['水彩'],
        { add: [add('a'), add('b'), add('c')], drop: [] },
        two,
      ),
    ).toEqual(['水彩', 'a', 'b'])
    expect(nextInterests(['水彩'], { add: [], drop: ['不在单上'] })).toBeNull()
    expect(nextInterests(['水彩'], null)).toBeNull()
  })

  it('证据门槛：不到两个不同作品撑着的不加，同一视频换分 P 算一个', () => {
    const sameVideo = [
      { url: `https://www.bilibili.com/video/${bv(1)}?p=1` },
      { url: `https://www.bilibili.com/video/${bv(1)}?p=2` },
    ]
    expect(
      nextInterests(['水彩'], { add: [add('猫咖')], drop: [] }, sameVideo),
    ).toBeNull()
    // 只指了一条、指了不存在的编号、根本没指：都不加。
    expect(
      nextInterests(['水彩'], { add: [add('猫咖', [1, 9])], drop: [] }, two),
    ).toBeNull()
    expect(
      nextInterests(['水彩'], { add: [add('猫咖', [])], drop: [] }, two),
    ).toBeNull()
    // 去掉不需要证据。
    expect(
      nextInterests(['水彩', '猫'], { add: [add('猫咖', [1])], drop: ['猫'] }),
    ).toEqual(['水彩'])
  })

  it('清单空着那一趟不要证据', () => {
    expect(
      nextInterests([], { add: [add('猫', []), add('胶片', [])], drop: [] }),
    ).toEqual(['猫', '胶片'])
  })

  it('同一个作品认成一样：B 站按 BV、YouTube 按视频号', () => {
    expect(
      interestWorkKey(`https://www.bilibili.com/video/${bv(1)}/?p=3`),
    ).toBe(interestWorkKey(`https://m.bilibili.com/video/${bv(1)}`))
    expect(interestWorkKey('https://www.youtube.com/watch?v=abc&t=10')).toBe(
      interestWorkKey('https://youtu.be/abc'),
    )
    expect(interestWorkKey('https://www.youtube.com/watch?v=abc')).not.toBe(
      interestWorkKey('https://www.youtube.com/watch?v=xyz'),
    )
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

  it('先占后结：调之前库里先记上估算，占住的也算进剩余', async () => {
    const persisted: number[] = []
    const meter = new OutingMeter(10_000, 1_000, async (n) => {
      persisted.push(n)
    })
    await meter.reserve(3_000)
    // 函数要是此刻被掐，库里留的是 1000 + 3000，接着跑的那段照它起算。
    expect(persisted).toEqual([4_000])
    expect(meter.remaining()).toBe(6_000)
    expect(() => meter.ensure(6_001)).toThrow(OutingBudgetExhausted)
    meter.settle(3_000, 1_200)
    expect(meter.usedTokens).toBe(2_200)
    expect(meter.remaining()).toBe(7_800)
    expect(meter.calls).toBe(1)
  })

  it('落库失败就不调，占位退回', async () => {
    const meter = new OutingMeter(10_000, 0, async () => {
      throw new Error('db down')
    })
    await expect(meter.reserve(2_000)).rejects.toThrow('db down')
    expect(meter.remaining()).toBe(10_000)
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
