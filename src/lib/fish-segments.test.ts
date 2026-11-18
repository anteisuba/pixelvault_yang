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

describe('splitFishSegments carries cues across a long line (11-17)', () => {
  /** 一句 30 字，四句一段装不下 120 —— 每段三句。 */
  const sentence = (seed: string) => `${seed.repeat(29)}。`

  it('no cues: pieces are untouched', () => {
    const long = [
      sentence('甲'),
      sentence('乙'),
      sentence('丙'),
      sentence('丁'),
      sentence('戊'),
    ].join('')
    const pieces = splitFishSegments(long)
    expect(pieces.length).toBeGreaterThan(1)
    expect(pieces.join('')).toBe(long)
    expect(pieces.some((piece) => piece.includes('['))).toBe(false)
  })

  it('a leading emotion cue reaches every piece of the line', () => {
    const body = Array.from({ length: 9 }, (_, i) =>
      sentence(String.fromCharCode(0x4e00 + i)),
    ).join('')
    const pieces = splitFishSegments(`[happy] ${body}`)
    expect(pieces).toHaveLength(3)
    expect(pieces.every((piece) => piece.startsWith('[happy] '))).toBe(true)
    // 正文一字不少、顺序不变。
    expect(pieces.map((piece) => piece.replace('[happy] ', '')).join('')).toBe(
      body,
    )
  })

  it('a new cue in the text takes over from there; sounds and pauses are not carried', () => {
    const line = `[happy] ${sentence('甲')}${sentence('乙')}${sentence('丙')}[sad] ${sentence('丁')}${sentence('戊')}${sentence('己')}[laughing] 哈哈。${sentence('庚')}${sentence('辛')}`
    const pieces = splitFishSegments(line)
    expect(pieces).toHaveLength(3)
    expect(pieces[0]!.startsWith('[happy] ')).toBe(true)
    expect(pieces[1]!.startsWith('[sad] ')).toBe(true)
    expect(pieces[2]!.startsWith('[sad] ')).toBe(true)
    // 那声笑只响一次：落在它原本那段，⛔ 带到下一段开头。
    expect(pieces.join('\n').match(/\[laughing\]/g)).toHaveLength(1)
    expect(pieces[2]!.startsWith('[sad] [laughing]')).toBe(false)
    expect(pieces[2]!.includes('[laughing]')).toBe(false)
  })

  it('a Drama paired tag cut in two is closed and reopened per piece', () => {
    const line = `${sentence('甲')}${sentence('乙')}<whisper>${sentence('丙')}${sentence('丁')}${sentence('戊')}</whisper>${sentence('己')}`
    const pieces = splitFishSegments(line)
    expect(pieces).toHaveLength(2)
    expect(pieces[0]!.endsWith('</whisper>')).toBe(true)
    expect(pieces[1]!.startsWith('<whisper>')).toBe(true)
    for (const piece of pieces) {
      expect(piece.split('<whisper>').length).toBe(
        piece.split('</whisper>').length,
      )
    }
  })

  it('short lines are not touched (each line already starts with its own cue)', () => {
    expect(splitFishSegments('[happy] 好。\n走吧。')).toEqual([
      '[happy] 好。',
      '走吧。',
    ])
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
