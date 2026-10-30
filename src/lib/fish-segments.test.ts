import { describe, expect, it } from 'vitest'

import {
  FISH_SEGMENTS,
  fishSegmentMaxTokens,
  fishSegmentRanAway,
  splitFishSegments,
} from './fish-segments'

describe('splitFishSegments (owner 10-30: say it in pieces)', () => {
  it('one line is one piece', () => {
    expect(
      splitFishSegments(
        '[soft tone] 诶……不用突然这样夸我吧。\n\n可爱又不能当饭吃……\n说真的～',
      ),
    ).toEqual([
      '[soft tone] 诶……不用突然这样夸我吧。',
      '可爱又不能当饭吃……',
      '说真的～',
    ])
  })

  it('cuts a long line at sentence ends and merges when there are too many', () => {
    const long = '这是一句话。'.repeat(40)
    const pieces = splitFishSegments(long)
    expect(pieces.length).toBeGreaterThan(1)
    expect(
      pieces.every((piece) => piece.length <= FISH_SEGMENTS.maxChars),
    ).toBe(true)
    expect(pieces.join('')).toBe(long)
    const many = Array.from({ length: 30 }, (_, i) => `第${i}行。`).join('\n')
    expect(splitFishSegments(many)).toHaveLength(FISH_SEGMENTS.maxSegments)
  })
})

describe('fish segment caps', () => {
  it('a short line gets far fewer tokens than the 1024 default', () => {
    // 那条 47 秒的回复：最短的一行也照样念得完，失控时最多跑十来秒。
    const tokens = fishSegmentMaxTokens('说真的，主人今天怎么嘴这么甜呀～')
    expect(tokens).toBeGreaterThan(5 * FISH_SEGMENTS.tokensPerSecond)
    expect(tokens).toBeLessThan(400)
    expect(fishSegmentMaxTokens('字'.repeat(500))).toBe(FISH_SEGMENTS.maxTokens)
  })

  it('a take that reaches the cap ran away', () => {
    const line = '说真的，主人今天怎么嘴这么甜呀～'
    const cap = fishSegmentMaxTokens(line) / FISH_SEGMENTS.tokensPerSecond
    expect(fishSegmentRanAway(line, 4)).toBe(false)
    expect(fishSegmentRanAway(line, cap)).toBe(true)
  })
})
