import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { extractMarkerBlock } from '@/lib/assistant-marker-block'
import {
  AssistantAskBlockSchema,
  AssistantNextStepSchema,
} from '@/types/assistant-protocol'

const NEXT_JSON = '{"satisfied":"写最终提示词","adjust":"告诉我要改哪里"}'
const ASK_JSON =
  '{"questions":[{"id":"q-1","question":"要什么风格？","options":[{"id":"o-1","label":"写实"},{"id":"o-2","label":"动漫"}]}]}'

describe('extractMarkerBlock', () => {
  it('passes content through untouched when the marker is absent', () => {
    const result = extractMarkerBlock('就是一段普通回复。', {
      marker: 'next',
      schema: AssistantNextStepSchema,
      streamComplete: true,
    })

    expect(result.content).toBe('就是一段普通回复。')
    expect(result.payload).toBeNull()
    expect(result.malformed).toBe(false)
  })

  it('extracts a complete block and strips it from the prose', () => {
    const result = extractMarkerBlock(
      `先聊两句。\n\n[[next]]\n${NEXT_JSON}\n[[/next]]`,
      { marker: 'next', schema: AssistantNextStepSchema, streamComplete: true },
    )

    expect(result.content).toBe('先聊两句。')
    expect(result.payload).toEqual({
      satisfied: '写最终提示词',
      adjust: '告诉我要改哪里',
    })
  })

  // 2026-07-31 真机事故：模型把闭合标记写成单括号，严格匹配把一整段合法载荷当成
  // 「还没写完」藏掉了 —— 没有卡也没有提示。一个括号不该让整个能力静默消失。
  it('accepts a single-bracket closing marker', () => {
    const result = extractMarkerBlock(`聊天。[[next]]${NEXT_JSON}[/next]`, {
      marker: 'next',
      schema: AssistantNextStepSchema,
      streamComplete: true,
    })

    expect(result.payload).not.toBeNull()
    expect(result.content).toBe('聊天。')
  })

  it('hides an unclosed block mid-stream without producing a payload', () => {
    const result = extractMarkerBlock(`聊天。[[next]]{"satis`, {
      marker: 'next',
      schema: AssistantNextStepSchema,
      streamComplete: false,
    })

    expect(result.payload).toBeNull()
    expect(result.malformed).toBe(false)
    expect(result.content).toBe('聊天。')
  })

  it('best-effort parses an unclosed block once the stream has ended', () => {
    const result = extractMarkerBlock(`聊天。[[next]]${NEXT_JSON}`, {
      marker: 'next',
      schema: AssistantNextStepSchema,
      streamComplete: true,
    })

    expect(result.payload).toEqual({
      satisfied: '写最终提示词',
      adjust: '告诉我要改哪里',
    })
  })

  it('reports malformed instead of swallowing a complete but unreadable block', () => {
    const result = extractMarkerBlock(
      '聊天。[[next]]not json at all[[/next]]',
      {
        marker: 'next',
        schema: AssistantNextStepSchema,
        streamComplete: true,
      },
    )

    expect(result.payload).toBeNull()
    expect(result.malformed).toBe(true)
  })

  it('tolerates a json code fence around the payload', () => {
    const result = extractMarkerBlock(
      `聊天。[[next]]\n\`\`\`json\n${NEXT_JSON}\n\`\`\`\n[[/next]]`,
      { marker: 'next', schema: AssistantNextStepSchema, streamComplete: true },
    )

    expect(result.payload).not.toBeNull()
  })

  // 串着抽：ask 的剥净正文喂给 next。两种标记必须互不吞噬，否则一轮回复里同时出现
  // 反问和收敛选项时会丢掉其中一个。
  it('chains two different markers without either eating the other', () => {
    const raw = `你想要什么感觉？\n\n[[ask]]${ASK_JSON}[[/ask]]\n\n[[next]]${NEXT_JSON}[[/next]]`

    const ask = extractMarkerBlock(raw, {
      marker: 'ask',
      schema: AssistantAskBlockSchema,
      streamComplete: true,
    })
    const next = extractMarkerBlock(ask.content, {
      marker: 'next',
      schema: AssistantNextStepSchema,
      streamComplete: true,
    })

    expect(ask.payload?.questions).toHaveLength(1)
    expect(ask.payload?.questions[0].multiSelect).toBe(false)
    expect(next.payload?.satisfied).toBe('写最终提示词')
    expect(next.content).toBe('你想要什么感觉？')
  })

  // 2026-08-21 真机事故：一轮回复里同时有 `[[setup]]` 和 `[[ask]]`，用户在打字机
  // 过程中看到裸的 `[[set` 蹦出来又消失。根因是「开标记还没写完」这段时间里抽取器
  // 压根不认得它，于是原样当正文返回 —— 藏起来的只有**已经闭合过开标记**的部分。
  it('holds back a tail that could still be growing into an open marker', () => {
    const frames = [
      '聊天。[',
      '聊天。[[',
      '聊天。[[n',
      '聊天。[[ne',
      '聊天。[[nex',
    ]

    for (const frame of frames) {
      const result = extractMarkerBlock(frame, {
        marker: 'next',
        schema: AssistantNextStepSchema,
        streamComplete: false,
      })
      expect(result.content).toBe('聊天。')
    }
  })

  it('releases the held tail as soon as it cannot be a marker any more', () => {
    const result = extractMarkerBlock('聊天。[[no', {
      marker: 'next',
      schema: AssistantNextStepSchema,
      streamComplete: false,
    })

    // 扣留只针对「还可能长成开标记」的尾巴。判定得出来就要立刻放行，
    // 否则方括号开头的正文（markdown 链接、`[1]` 这种注脚）会被永久吃掉。
    expect(result.content).toBe('聊天。[[no')
  })

  it('stops holding once the stream is over — a stray bracket is just text', () => {
    const result = extractMarkerBlock('聊天。[[ne', {
      marker: 'next',
      schema: AssistantNextStepSchema,
      streamComplete: true,
    })

    expect(result.content).toBe('聊天。[[ne')
  })

  it('keeps only the first complete block but still strips the rest', () => {
    const schema = z.object({ v: z.number() })
    const result = extractMarkerBlock(
      'a[[k]]{"v":1}[[/k]]b[[k]]{"v":2}[[/k]]c',
      { marker: 'k', schema, streamComplete: true },
    )

    expect(result.payload).toEqual({ v: 1 })
    expect(result.content).toBe('abc')
  })
})
