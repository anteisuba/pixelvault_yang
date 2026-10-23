import { describe, expect, it } from 'vitest'

import { ASSISTANT_V3_HISTORY } from '@/constants/assistant-v3'
import type { AssistantV3HistorySummary } from '@/types/assistant-v3'

import {
  ASSISTANT_V3_HISTORY_SUMMARY_HEADING,
  assistantV3HistoryMessages,
  assistantV3HistorySummaryMaterial,
  assistantV3HistoryWindowStart,
  assistantV3TurnFingerprint,
  mergeAssistantV3HistorySummaries,
  normalizeAssistantV3HistorySummary,
  pinnedAssistantV3History,
  planAssistantV3History,
  readAssistantV3HistorySummaryDraft,
  renderAssistantV3HistorySummary,
  splitAssistantV3History,
  type AssistantV3HistoryMessage,
} from './assistant-v3-history'

const { blockTurns, maxChars, maxMessages } = ASSISTANT_V3_HISTORY

/** n 轮对白（每轮一问一答，每轮 `chars` 字）+ 这一句。 */
function conversation(turns: number, chars = 100): AssistantV3HistoryMessage[] {
  const messages: AssistantV3HistoryMessage[] = []
  for (let index = 0; index < turns; index += 1) {
    const half = Math.floor(chars / 2)
    messages.push({ role: 'user', content: `u${index}`.padEnd(half, '.') })
    messages.push({
      role: 'assistant',
      content: `a${index}`.padEnd(chars - half, '.'),
    })
  }
  messages.push({ role: 'user', content: 'now' })
  return messages
}

function summary(
  through: string,
  turns: number,
  decisions: string[] = [],
): AssistantV3HistorySummary {
  return {
    through,
    turns,
    decisions,
    preferences: [],
    openItems: [],
    names: [],
  }
}

describe('splitAssistantV3History', () => {
  it('一条 user 起一轮；最前面没有 user 的自成一轮；空白的不算；这一句单拎出来', () => {
    const { turns, latest } = splitAssistantV3History([
      { role: 'assistant', content: 'hello' },
      { role: 'user', content: 'a' },
      { role: 'assistant', content: '   ' },
      { role: 'user', content: 'b' },
      { role: 'assistant', content: 'B' },
      { role: 'assistant', content: 'B2' },
      { role: 'user', content: 'latest' },
      { role: 'assistant', content: 'partial reply (relay)' },
    ])
    expect(latest).toBe('latest')
    expect(turns.map((turn) => turn.messages.map((m) => m.content))).toEqual([
      ['hello'],
      ['a'],
      ['b', 'B', 'B2'],
    ])
    expect(turns.map((turn) => turn.chars)).toEqual([5, 1, 4])
  })

  it('指纹认原字：同字同指纹，差一个字就不同', () => {
    const one = assistantV3TurnFingerprint([{ role: 'user', content: 'x' }])
    expect(assistantV3TurnFingerprint([{ role: 'user', content: 'x' }])).toBe(
      one,
    )
    expect(
      assistantV3TurnFingerprint([{ role: 'assistant', content: 'x' }]),
    ).not.toBe(one)
    expect(
      assistantV3TurnFingerprint([{ role: 'user', content: 'y' }]),
    ).not.toBe(one)
    expect(one).toMatch(/^[0-9a-f]{14}$/)
  })
})

describe('assistantV3HistoryWindowStart', () => {
  it('放得下就从头发', () => {
    const { turns } = splitAssistantV3History(conversation(10))
    expect(assistantV3HistoryWindowStart(turns)).toBe(0)
  })

  it('按块滑：起点只落在 blockTurns 的整数倍上，两次滑动之间不动', () => {
    const perTurn = Math.floor(maxChars / 12)
    const starts: number[] = []
    for (let total = 1; total <= 60; total += 1) {
      const { turns } = splitAssistantV3History(conversation(total, perTurn))
      const start = assistantV3HistoryWindowStart(turns)
      starts.push(start)
      expect(start % blockTurns).toBe(0)
      const shown = turns.slice(start)
      expect(
        shown.reduce((sum, turn) => sum + turn.chars, 0),
      ).toBeLessThanOrEqual(maxChars)
    }
    // 起点只增不减，且一共只换了几次。
    expect([...starts].sort((a, b) => a - b)).toEqual(starts)
    expect(new Set(starts).size).toBeLessThan(10)
  })

  it('条数也封顶（一长串一两个字的来回）', () => {
    const { turns } = splitAssistantV3History(conversation(maxMessages, 4))
    const start = assistantV3HistoryWindowStart(turns)
    expect(start % blockTurns).toBe(0)
    expect(
      turns.slice(start).reduce((sum, turn) => sum + turn.messages.length, 0),
    ).toBeLessThanOrEqual(maxMessages)
  })

  it('最后一块自己就超了才逐轮挪；最近那一轮再长也留着', () => {
    const big = Math.floor(maxChars * 0.6)
    const { turns } = splitAssistantV3History(conversation(blockTurns + 3, big))
    expect(assistantV3HistoryWindowStart(turns)).toBe(turns.length - 1)
    const huge = splitAssistantV3History(conversation(3, maxChars * 3)).turns
    expect(assistantV3HistoryWindowStart(huge)).toBe(2)
  })
})

describe('planAssistantV3History', () => {
  const perTurn = Math.floor(maxChars / 12)
  /** 第一次滑动那一轮：前一轮从头放得下，这一轮放不下。 */
  function firstSlide() {
    for (let total = 1; ; total += 1) {
      const { turns } = splitAssistantV3History(conversation(total, perTurn))
      if (assistantV3HistoryWindowStart(turns) > 0) return turns
    }
  }

  it('补不了（没会话 / 存不下 / 隐身）：照样滑，不留、不补', () => {
    const turns = firstSlide()
    const plan = planAssistantV3History({
      turns,
      summaries: [],
      canSummarize: false,
    })
    expect(plan.start).toBe(blockTurns)
    expect(plan.summary).toBeNull()
    expect(plan.summarize).toBeNull()
  })

  it('滑出去的那几轮还没有摘要：多留一轮（起点不动），交给后台补', () => {
    const turns = firstSlide()
    const plan = planAssistantV3History({
      turns,
      summaries: [],
      canSummarize: true,
    })
    expect(plan.start).toBe(0)
    expect(plan.summarize).toEqual({ previous: null, from: 0, to: blockTurns })
  })

  it('多留那一轮也守条数上限（只有字数可以多出一轮）', () => {
    // 一长串两三个字的来回：上一轮的窗口正好 maxMessages 条，再多留一轮就超了。
    const { turns } = splitAssistantV3History(
      conversation(maxMessages / 2 + 1, 4),
    )
    const need = assistantV3HistoryWindowStart(turns)
    expect(need).toBeGreaterThan(0)
    const plan = planAssistantV3History({
      turns,
      summaries: [],
      canSummarize: true,
    })
    expect(plan.start).toBe(need)
    expect(plan.summarize).toEqual({ previous: null, from: 0, to: need })
    expect(
      assistantV3HistoryMessages(turns, plan.start).length,
    ).toBeLessThanOrEqual(maxMessages)
  })

  it('再下一轮摘要还没回来：照样滑（只多留一轮），接着补', () => {
    const turns = firstSlide()
    const next = splitAssistantV3History(
      conversation(turns.length + 1, perTurn),
    ).turns
    const plan = planAssistantV3History({
      turns: next,
      summaries: [],
      canSummarize: true,
    })
    expect(plan.start).toBe(blockTurns)
    expect(plan.summarize).toEqual({ previous: null, from: 0, to: blockTurns })
  })

  it('摘要管到窗口起点：起点照滑、带上它、不再补', () => {
    const turns = firstSlide()
    const covering = summary(turns[blockTurns - 1]!.fingerprint, blockTurns, [
      '16:9',
    ])
    const plan = planAssistantV3History({
      turns,
      summaries: [covering],
      canSummarize: true,
    })
    expect(plan.start).toBe(blockTurns)
    expect(plan.summary).toBe(covering)
    expect(plan.summarize).toBeNull()
  })

  it('挑管得最远的那一份；一样远取新的', () => {
    const turns = splitAssistantV3History(conversation(40, perTurn)).turns
    const need = assistantV3HistoryWindowStart(turns)
    expect(need).toBeGreaterThanOrEqual(2 * blockTurns)
    const older = summary(turns[blockTurns - 1]!.fingerprint, blockTurns)
    const atNeed = summary(turns[need - 1]!.fingerprint, need)
    const atNeedNewer = summary(turns[need - 1]!.fingerprint, need, ['newer'])
    const plan = planAssistantV3History({
      turns,
      summaries: [older, atNeed, atNeedNewer],
      canSummarize: true,
    })
    expect(plan.summary).toBe(atNeedNewer)
    expect(plan.start).toBe(need)
    expect(plan.summarize).toBeNull()
  })

  it('管到窗口里面的那一份（刷新后前端重带的几条里有它管过的）：那几轮不再原样发', () => {
    const turns = splitAssistantV3History(conversation(6, perTurn)).turns
    expect(assistantV3HistoryWindowStart(turns)).toBe(0)
    const older = summary('ffffffffffffff', 8)
    const overlapping = summary(turns[1]!.fingerprint, 16)
    const plan = planAssistantV3History({
      turns,
      summaries: [older, overlapping],
      canSummarize: true,
    })
    expect(plan).toEqual({ start: 2, summary: overlapping, summarize: null })
    // 管到最后一轮（落后的标签页）：最近那一轮照样留着。
    const all = summary(turns.at(-1)!.fingerprint, 20)
    expect(
      planAssistantV3History({ turns, summaries: [all], canSummarize: true })
        .start,
    ).toBe(turns.length - 1)
  })

  it('一份旧的只管到中间：缺口那几轮接着它补（上一份 + 那几轮）', () => {
    const turns = splitAssistantV3History(conversation(40, perTurn)).turns
    const need = assistantV3HistoryWindowStart(turns)
    const older = summary(turns[blockTurns - 1]!.fingerprint, blockTurns)
    const plan = planAssistantV3History({
      turns,
      summaries: [older],
      canSummarize: true,
    })
    expect(plan.summary).toBe(older)
    expect(plan.summarize).toEqual({
      previous: older,
      from: blockTurns,
      to: need,
    })
  })

  it('刷新之后（前面几轮前端没再带）：指纹对不上 = 它管的全在请求之前', () => {
    const turns = splitAssistantV3History(conversation(6, perTurn)).turns
    const earlier = summary('ffffffffffffff', 30, ['16:9'])
    const plan = planAssistantV3History({
      turns,
      summaries: [earlier],
      canSummarize: true,
    })
    expect(plan.start).toBe(0)
    expect(plan.summary).toBe(earlier)
    expect(plan.summarize).toBeNull()
  })

  it('接力那几跳照板子上的：从后往前数几轮', () => {
    const turns = splitAssistantV3History(conversation(20)).turns
    const pinned = summary('abc', 4)
    expect(
      pinnedAssistantV3History(turns, { turns: 5, summary: pinned }),
    ).toEqual({ start: 15, summary: pinned, summarize: null })
    expect(pinnedAssistantV3History(turns, { turns: 50 }).start).toBe(0)
    expect(
      assistantV3HistoryMessages(turns, 18).map(
        (message) => message.content[0],
      ),
    ).toEqual(['u', 'a', 'u', 'a'])
  })
})

describe('摘要', () => {
  it('渲成固定格式的一段；同一份逐字相同；四栏都空就没有这一段', () => {
    const one = {
      ...summary('abc', 8, ['whole film in 16:9']),
      names: ['img-1a2b3c — hero portrait'],
    }
    const text = renderAssistantV3HistorySummary(one)
    expect(text).toBe(renderAssistantV3HistorySummary({ ...one }))
    expect(text).toBe(`

${ASSISTANT_V3_HISTORY_SUMMARY_HEADING} — the first 8 turns of this conversation are no longer shown below; these notes are what they settled.
Decided:
  - whole film in 16:9
Names and ids:
  - img-1a2b3c — hero portrait
- Treat these as already agreed: build on them without asking again or reciting them back. What the creator says now wins over them.`)
    expect(renderAssistantV3HistorySummary(summary('abc', 8))).toBe('')
    expect(renderAssistantV3HistorySummary(null)).toBe('')
    // 和角色聊天：同一副四栏，按故事的标题摆。
    const story = renderAssistantV3HistorySummary(one, 'story')
    expect(story).toContain('these notes are the story so far.')
    expect(story).toContain('What happened:\n  - whole film in 16:9')
    expect(story).toContain('People and things in the story:')
    expect(story).not.toContain('Decided:')
  })

  it('收拾模型回的：去空、去重、压空白、截字、限条数', () => {
    const { maxItems, maxItemChars } = ASSISTANT_V3_HISTORY.summary
    const normalized = normalizeAssistantV3HistorySummary(
      {
        decisions: [
          '  16:9 \n landscape ',
          '16:9 landscape',
          '',
          'x'.repeat(999),
        ],
        preferences: Array.from({ length: maxItems + 5 }, (_, i) => `p${i}`),
        openItems: [],
        names: [],
      },
      { through: 'abc', turns: 8 },
    )
    expect(normalized.decisions[0]).toBe('16:9 landscape')
    expect(normalized.decisions).toHaveLength(2)
    expect(normalized.decisions[1]).toHaveLength(maxItemChars)
    expect(normalized.decisions[1]!.endsWith('…')).toBe(true)
    expect(normalized.preferences).toHaveLength(maxItems)
    expect(normalized).toMatchObject({ through: 'abc', turns: 8 })
  })

  it('并进存着的那几份：管到同一轮的换掉，只留最近 keep 份', () => {
    const { keep } = ASSISTANT_V3_HISTORY.summary
    let stored: AssistantV3HistorySummary[] = []
    for (let index = 0; index < keep + 2; index += 1)
      stored = mergeAssistantV3HistorySummaries(stored, summary(`t${index}`, 8))
    expect(stored.map((one) => one.through)).toEqual(
      Array.from({ length: keep }, (_, i) => `t${i + 2}`),
    )
    const replaced = mergeAssistantV3HistorySummaries(
      stored,
      summary(`t${keep + 1}`, 8, ['again']),
    )
    expect(replaced).toHaveLength(keep)
    expect(replaced.at(-1)?.decisions).toEqual(['again'])
  })

  it('原料：上一份原样 + 那几轮；整份超了就每条平分着截（⛔ 整轮丢）', () => {
    const { sourceChars, sourceMessageChars } = ASSISTANT_V3_HISTORY.summary
    const turns = splitAssistantV3History(conversation(20, 30_000)).turns
    const material = assistantV3HistorySummaryMaterial(
      summary('abc', 8, ['keep me']),
      turns,
    )
    expect(material).toContain('PREVIOUS NOTES\n{"decisions":["keep me"]')
    expect(material.length).toBeLessThan(sourceChars * 1.2)
    for (let index = 0; index < 20; index += 1) {
      expect(material).toContain(`[creator] u${index}`)
      expect(material).toContain(`[assistant] a${index}`)
    }
    const small = assistantV3HistorySummaryMaterial(
      null,
      splitAssistantV3History(conversation(1, 2 * sourceMessageChars + 10))
        .turns,
    )
    expect(small).toContain('PREVIOUS NOTES\n(none)')
    expect(small).toContain('…')
  })

  it('读模型回的：剥围栏、取 {…}、对象条目拼成一行；四栏一栏都没有的不算', () => {
    expect(
      readAssistantV3HistorySummaryDraft(
        'Sure:\n```json\n{"decisions":["16:9"],"names":[{"name":"img-1","what":"hero"}]}\n```',
      ),
    ).toEqual({
      decisions: ['16:9'],
      preferences: [],
      openItems: [],
      names: ['img-1 — hero'],
    })
    expect(
      readAssistantV3HistorySummaryDraft('notes: {"openItems": ["shot 3"]} ok'),
    ).toMatchObject({ openItems: ['shot 3'] })
    expect(readAssistantV3HistorySummaryDraft('{"summary": "x"}')).toBeNull()
    expect(readAssistantV3HistorySummaryDraft('no json here')).toBeNull()
    expect(
      readAssistantV3HistorySummaryDraft('{"decisions": "not a list"}'),
    ).toEqual({ decisions: [], preferences: [], openItems: [], names: [] })
  })
})
