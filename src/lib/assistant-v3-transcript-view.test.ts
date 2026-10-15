import { describe, expect, it } from 'vitest'

import {
  ASSISTANT_V3_LIMITS,
  ASSISTANT_V3_TRANSCRIPT_SLIM,
  type AssistantV3Tool,
} from '@/constants/assistant-v3'
import type { AssistantV3TranscriptEntry } from '@/types/assistant-v3'

import {
  planAssistantV3TranscriptView,
  slimAssistantV3Result,
} from './assistant-v3-transcript-view'

const MAX = ASSISTANT_V3_LIMITS.maxTranscriptChars
/** 一张卡约 2 万字：四张就过了 `slimAboveChars`（长轮次）。 */
const LONG = 360

let ids = 0
function assistant(
  text = '',
  inputs: string[] = [],
): AssistantV3TranscriptEntry {
  return {
    type: 'assistant',
    text,
    calls: inputs.map((input) => ({
      id: `call-${(ids += 1)}`,
      tool: 'write',
      input,
    })),
  }
}

function result(
  tool: AssistantV3Tool,
  output: string,
  compact?: string,
): AssistantV3TranscriptEntry {
  return {
    type: 'result',
    id: `call-${(ids += 1)}`,
    tool,
    output,
    error: false,
    ...(compact ? { compact } : {}),
  }
}

/** 一张卡的 read 结果：头一行带句柄，正文够长、每段都有一句只在这张卡里的话。 */
function cardText(handle: string, marker: string, lines = 24): string {
  return [
    `${handle} · video · S0 走廊 · seedance-2.5-byteplus`,
    ...Array.from(
      { length: lines },
      (_, index) =>
        `0-${index}s 镜头沿走廊推进，烛光在石墙上摇晃，人物的影子拖得很长，脚步声一下一下地落在石板上。${marker}${index}`,
    ),
  ].join('\n')
}

function textAt(
  view: ReturnType<typeof planAssistantV3TranscriptView>,
  entries: readonly AssistantV3TranscriptEntry[],
  index: number,
): string {
  const entry = entries[index]!
  if (entry.type === 'assistant')
    return view.assistantTexts.get(index) ?? entry.text
  if (entry.type === 'result') return view.results.get(index) ?? entry.output
  return ''
}

describe('本轮记录瘦身 · 最近几条原样（长轮次）', () => {
  it('短的结果一个字不动（瘦了省不下几个字，还白断一次缓存）', () => {
    const entries = [
      assistant('', ['{}']),
      result('read', 'vid-01a1b2 · S01 · 短'),
      assistant('', ['{}']),
      result('read', 'vid-02a1b2 · S02 · 短'),
      assistant('', ['{}']),
      result('read', 'vid-03a1b2 · S03 · 短'),
      assistant('', ['{}']),
      result('read', 'vid-04a1b2 · S04 · 短'),
      assistant('', ['{}']),
      result('read', 'vid-05a1b2 · S05 · 短'),
    ]
    const view = planAssistantV3TranscriptView(entries)
    expect(view.level).toBe(0)
    entries.forEach((entry, index) => {
      if (entry.type === 'result')
        expect(textAt(view, entries, index)).toBe(entry.output)
    })
  })

  it('本轮记录没过 slimAboveChars：查来的再多也一字不动（缓存前缀不断）', () => {
    const entries = [
      assistant('', ['{}']),
      result('read', cardText('vid-01a1b2', '烛泪')),
      assistant('', ['{}']),
      result('read', cardText('vid-02a1b2', '雨痕')),
      assistant('', ['{}']),
      result('read', cardText('vid-03a1b2', '盔甲')),
      assistant('', ['{}']),
      result('read', cardText('vid-04a1b2', '门环')),
      assistant('', ['{}']),
    ]
    expect(
      entries.reduce(
        (sum, entry) =>
          sum + (entry.type === 'result' ? entry.output.length : 0),
        0,
      ),
    ).toBeLessThan(ASSISTANT_V3_TRANSCRIPT_SLIM.slimAboveChars)
    const view = planAssistantV3TranscriptView(entries)
    expect(view.level).toBe(0)
    expect(textAt(view, entries, 1)).toBe(
      (entries[1] as { output: string }).output,
    )
  })

  it('长轮次：查来的长东西只留最近 3 条原样，更早的换成摘要、句柄还在', () => {
    const entries = [
      assistant('', ['{}']),
      result('read', cardText('vid-01a1b2', '烛泪', LONG)),
      assistant('', ['{}']),
      result('read', cardText('vid-02a1b2', '雨痕', LONG)),
      assistant('', ['{}']),
      result('read', cardText('vid-03a1b2', '盔甲', LONG)),
      assistant('', ['{}']),
      result('read', cardText('vid-04a1b2', '门环', LONG)),
    ]
    const view = planAssistantV3TranscriptView(entries)
    expect(view.level).toBe(0)
    const first = textAt(view, entries, 1)
    expect(first).toContain('slimmed here — call read again')
    expect(first).toContain('vid-01a1b2')
    expect(first).not.toContain('烛泪3')
    for (const index of [3, 5, 7])
      expect(textAt(view, entries, index)).toBe(
        (entries[index] as { output: string }).output,
      )
  })

  it('模型刚要的那几条（最后一条 assistant 之后）一条都不瘦，哪怕一次要了好几条', () => {
    const fresh = ['vid-01a1b2', 'vid-02a1b2', 'vid-03a1b2', 'vid-04a1b2'].map(
      (handle) => result('read', cardText(handle, handle, LONG)),
    )
    const entries = [assistant('', ['{}', '{}', '{}', '{}']), ...fresh]
    const view = planAssistantV3TranscriptView(entries)
    fresh.forEach((entry, offset) =>
      expect(textAt(view, entries, offset + 1)).toBe(
        (entry as { output: string }).output,
      ),
    )
  })

  it('整份写法不按最近几条瘦；改动回执也不（它们说的是现状）', () => {
    const guide = `PROMPT GUIDE FOR seedance-2.5-byteplus\n${'规则一行。\n'.repeat(400)}`
    const receipt = `Changed vid-01a1b2.\n${'改动回执。\n'.repeat(400)}`
    const entries = [
      assistant('', ['{}']),
      result('read', guide),
      result('write', receipt),
      assistant('', ['{}']),
      result('read', cardText('vid-02a1b2', 'a', LONG)),
      assistant('', ['{}']),
      result('read', cardText('vid-03a1b2', 'b', LONG)),
      assistant('', ['{}']),
      result('read', cardText('vid-04a1b2', 'c', LONG)),
      assistant('', ['{}']),
      result('read', cardText('vid-05a1b2', 'd', LONG)),
    ]
    const view = planAssistantV3TranscriptView(entries)
    expect(textAt(view, entries, 1)).toBe(guide)
    expect(textAt(view, entries, 2)).toBe(receipt)
    expect(textAt(view, entries, 4)).toContain('slimmed here')
  })

  it('查证那一步：之前的用短版（原有规矩），刚要的用整段', () => {
    const full = `[1] 标题 · example.com\n${'摘录。'.repeat(600)}`
    const short = '[1] 标题 · example.com · 一句话'
    const earlier = [assistant('', ['{}']), result('search_web', full, short)]
    const view = planAssistantV3TranscriptView([
      ...earlier,
      assistant('', ['{}']),
    ])
    expect(view.results.get(1)).toBe(short)
    expect(planAssistantV3TranscriptView(earlier).results.get(1)).toBe(full)
  })

  it('同一份记录永远算出同一份样子（接力那一跳与下一步逐字相同）', () => {
    const entries = [
      assistant('', ['{}']),
      result('read', cardText('vid-01a1b2', 'x', LONG)),
      assistant('', ['{}']),
      result('read', cardText('vid-02a1b2', 'y', LONG)),
      assistant('', ['{}']),
      result('read', cardText('vid-03a1b2', 'z', LONG)),
      assistant('', ['{}']),
      result('read', cardText('vid-04a1b2', 'w', LONG)),
      assistant('', ['{}']),
    ]
    const one = planAssistantV3TranscriptView(entries)
    expect(one.results.get(1)).toContain('slimmed here')
    const two = planAssistantV3TranscriptView(structuredClone(entries))
    expect([...two.results]).toEqual([...one.results])
    expect(two.chars).toBe(one.chars)
  })
})

describe('本轮记录瘦身 · 摘要', () => {
  it('留第一行、条目行（#n / [n] / 句柄开头）和别处出现的句柄', () => {
    const text = [
      'Found 3 pictures:',
      '#1 · 雨夜走廊 · example.com',
      '#2 · 礼堂 · example.org',
      '[3] 一篇文章 · example.net',
      `正文里提到 img-249e8b 与 vid-09a1b2。${'很长的正文。'.repeat(300)}`,
    ].join('\n')
    const slim = slimAssistantV3Result('search_web', text)
    expect(slim).toContain('Found 3 pictures:')
    expect(slim).toContain('#1 · 雨夜走廊')
    expect(slim).toContain('[3] 一篇文章')
    expect(slim).toContain('Also mentions: img-249e8b, vid-09a1b2')
    expect(slim).not.toContain('很长的正文。很长的正文。很长的正文。')
  })

  it('每行截到上限，条目行只留前几行', () => {
    const { slimLines, slimLineChars } = ASSISTANT_V3_TRANSCRIPT_SLIM
    const text = Array.from(
      { length: slimLines + 5 },
      (_, index) => `#${index + 1} ${'很长的标题'.repeat(60)}`,
    ).join('\n')
    const slim = slimAssistantV3Result('search_web', text).split('\n')
    expect(slim.filter((line) => line.startsWith('#'))).toHaveLength(slimLines)
    for (const line of slim.slice(1))
      expect(line.length).toBeLessThanOrEqual(slimLineChars + 1)
  })
})

describe('本轮记录瘦身 · 超了 maxTranscriptChars（一级一级瘦）', () => {
  const big = (handle: string) =>
    `${handle} · 一张卡\n${'很长的一段。'.repeat(9_000)}`

  it('① 之前查来的东西全瘦（含最近 3 条）', () => {
    const writes = Array.from({ length: 8 }, () => 'w'.repeat(30_000))
    const entries = [
      assistant('', ['{}']),
      result('read', big('vid-01a1b2')),
      assistant('', ['{}']),
      result('read', big('vid-02a1b2')),
      assistant('', ['{}']),
      result('read', big('vid-03a1b2')),
      assistant('', writes),
      result('write', 'ok'),
    ]
    const view = planAssistantV3TranscriptView(entries)
    expect(view.level).toBe(1)
    expect(view.chars).toBeLessThanOrEqual(MAX)
    for (const index of [1, 3, 5])
      expect(textAt(view, entries, index)).toContain('slimmed here')
  })

  it('② 之前的所有结果全瘦（改动回执、写法也瘦）', () => {
    const entries = [
      ...Array.from({ length: 8 }, () => [
        assistant('', ['{}']),
        result('write', big('vid-01a1b2')),
      ]).flat(),
      assistant('', ['{}']),
    ]
    const view = planAssistantV3TranscriptView(entries)
    expect(view.level).toBe(2)
    expect(view.chars).toBeLessThanOrEqual(MAX)
    expect(textAt(view, entries, 1)).toContain('slimmed here')
  })

  it('③ 更早的 assistant 正文截短；④ 最后才动模型刚要的那几条，平分剩下的字数', () => {
    const prose = '我先看看这几张卡。'.repeat(6_000)
    const third = [
      ...Array.from({ length: 8 }, () => [
        assistant(prose, ['{}']),
        result('write', 'ok'),
      ]).flat(),
      assistant('', ['{}']),
      result('read', 'vid-01a1b2 · 短'),
    ]
    const level3 = planAssistantV3TranscriptView(third)
    expect(level3.level).toBe(3)
    expect(level3.chars).toBeLessThanOrEqual(MAX)
    expect(textAt(level3, third, 0).length).toBeLessThanOrEqual(
      ASSISTANT_V3_TRANSCRIPT_SLIM.clippedAssistantChars,
    )
    expect(textAt(level3, third, 17)).toBe('vid-01a1b2 · 短')

    const fresh = Array.from({ length: 8 }, (_, index) =>
      result('read', big(`vid-0${index + 1}a1b2`)),
    )
    const fourth = [assistant('', Array(8).fill('{}')), ...fresh]
    const level4 = planAssistantV3TranscriptView(fourth)
    expect(level4.level).toBe(4)
    expect(level4.chars).toBeLessThanOrEqual(MAX)
    const clipped = textAt(level4, fourth, 1)
    expect(clipped.startsWith('vid-01a1b2 · 一张卡')).toBe(true)
    expect(clipped).toContain("cut to fit this turn's room")
  })
})
