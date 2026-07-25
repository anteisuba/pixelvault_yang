import { describe, expect, it } from 'vitest'

import { buildTriggerHighlightSegments } from './PromptTriggerHighlight'

const owner = (phrase: string, ownerName = 'LoRA A') => ({ phrase, ownerName })

/** 拼回原文 —— 切片永远不能丢字或改字。 */
function rejoin(segments: { text: string }[]) {
  return segments.map((s) => s.text).join('')
}

describe('buildTriggerHighlightSegments', () => {
  it('marks a plain trigger word and keeps the rest untouched', () => {
    const segments = buildTriggerHighlightSegments('1girl, jinhsi, dress', [
      owner('jinhsi'),
    ])
    expect(rejoin(segments)).toBe('1girl, jinhsi, dress')
    expect(segments.filter((s) => s.matchedBy)).toEqual([
      { text: 'jinhsi', matchedBy: 'LoRA A' },
    ])
  })

  it('matches case-insensitively', () => {
    const segments = buildTriggerHighlightSegments('A JINHSI portrait', [
      owner('jinhsi'),
    ])
    expect(segments.filter((s) => s.matchedBy)).toEqual([
      { text: 'JINHSI', matchedBy: 'LoRA A' },
    ])
  })

  it('does not match inside a longer latin word', () => {
    const segments = buildTriggerHighlightSegments('jinhsix and xjinhsi', [
      owner('jinhsi'),
    ])
    expect(segments.filter((s) => s.matchedBy)).toHaveLength(0)
  })

  it('treats regex metacharacters in the trigger as literal text', () => {
    const trigger = 'denia \\(wuthering waves\\)'
    const segments = buildTriggerHighlightSegments(`1girl, ${trigger}, smile`, [
      owner(trigger),
    ])
    expect(segments.filter((s) => s.matchedBy)).toEqual([
      { text: trigger, matchedBy: 'LoRA A' },
    ])
  })

  it('prefers the longer phrase when two triggers overlap', () => {
    const segments = buildTriggerHighlightSegments('a black ribbon dress', [
      owner('black', 'Short'),
      owner('black ribbon', 'Long'),
    ])
    expect(segments.filter((s) => s.matchedBy)).toEqual([
      { text: 'black ribbon', matchedBy: 'Long' },
    ])
  })

  it('marks every occurrence of the same trigger', () => {
    const segments = buildTriggerHighlightSegments('jinhsi, and jinhsi again', [
      owner('jinhsi'),
    ])
    expect(segments.filter((s) => s.matchedBy)).toHaveLength(2)
  })

  it('matches a CJK trigger surrounded by CJK text', () => {
    const segments = buildTriggerHighlightSegments('画面里的达妮娅在微笑', [
      owner('达妮娅'),
    ])
    expect(segments.filter((s) => s.matchedBy)).toEqual([
      { text: '达妮娅', matchedBy: 'LoRA A' },
    ])
  })

  it('ignores blank phrases and returns the text as one segment', () => {
    const segments = buildTriggerHighlightSegments('some prompt', [
      owner('   '),
    ])
    expect(segments).toEqual([{ text: 'some prompt', matchedBy: null }])
  })

  it('returns nothing for empty text', () => {
    expect(buildTriggerHighlightSegments('', [owner('jinhsi')])).toEqual([])
  })

  it('never drops or reorders characters', () => {
    const text = 'jinhsi, black ribbon, 达妮娅, floral dress, jinhsi'
    const segments = buildTriggerHighlightSegments(text, [
      owner('jinhsi'),
      owner('black ribbon'),
      owner('达妮娅'),
    ])
    expect(rejoin(segments)).toBe(text)
  })
})
