import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import { ASSISTANT_OPERATOR_EVENTS } from '@/constants/assistant-operator'
import { ASSISTANT_STREAM_CONTENT_TYPE } from '@/constants/assistant-stream'
import {
  ASSISTANT_OPERATOR_FALLBACK_ERROR,
  createOperatorMessageStreamer,
  toAssistantOperatorSseResponse,
} from '@/lib/assistant-operator-stream'
import { parseSseStream } from '@/lib/sse'
import type { AssistantOperatorEvent } from '@/types/assistant-operator'

async function readFrames(
  response: Response,
): Promise<{ event: string; data: Record<string, unknown> }[]> {
  const frames: { event: string; data: Record<string, unknown> }[] = []
  const body = response.body
  if (!body) throw new Error('no body')
  for await (const frame of parseSseStream(body)) {
    frames.push({
      event: frame.event,
      data: JSON.parse(frame.data) as Record<string, unknown>,
    })
  }
  return frames
}

describe('操作员流成帧器', () => {
  it('open 排第一，之后逐个事件；帧名与载荷里的 type 一致', async () => {
    const response = toAssistantOperatorSseResponse({
      routeName: 'test',
      events: async function* () {
        yield {
          type: ASSISTANT_OPERATOR_EVENTS.plan,
          steps: ['a'],
        } as AssistantOperatorEvent
        yield {
          type: ASSISTANT_OPERATOR_EVENTS.done,
        } as AssistantOperatorEvent
      },
    })

    expect(response.headers.get('Content-Type')).toBe(
      ASSISTANT_STREAM_CONTENT_TYPE,
    )
    expect(response.headers.get('X-Accel-Buffering')).toBe('no')

    const frames = await readFrames(response)
    expect(frames.map((frame) => frame.event)).toEqual([
      ASSISTANT_OPERATOR_EVENTS.open,
      ASSISTANT_OPERATOR_EVENTS.plan,
      ASSISTANT_OPERATOR_EVENTS.done,
    ])
    for (const frame of frames) {
      expect(frame.data.type).toBe(frame.event)
    }
  })

  it('事件源抛错时补一帧结构化 error，而不是打断流', async () => {
    const response = toAssistantOperatorSseResponse({
      routeName: 'test',
      events: async function* () {
        yield {
          type: ASSISTANT_OPERATOR_EVENTS.message,
          text: 'half a sentence',
        } as AssistantOperatorEvent
        throw new Error('provider exploded')
      },
    })

    const frames = await readFrames(response)
    expect(frames.map((frame) => frame.event)).toEqual([
      ASSISTANT_OPERATOR_EVENTS.open,
      ASSISTANT_OPERATOR_EVENTS.message,
      ASSISTANT_OPERATOR_EVENTS.error,
    ])
    expect(frames.at(-1)?.data.errorCode).toBe(
      ASSISTANT_OPERATOR_FALLBACK_ERROR.errorCode,
    )
  })

  it('客户端取消时 abort 传下去，生成器跑完自己的收尾，且不再往关掉的流里写', async () => {
    let finallyRan = false
    let sawAbort = false
    let produced = 0

    const response = toAssistantOperatorSseResponse({
      routeName: 'test',
      events: async function* (signal) {
        try {
          while (true) {
            await Promise.resolve()
            if (signal.aborted) sawAbort = true
            produced += 1
            yield {
              type: ASSISTANT_OPERATOR_EVENTS.message,
              text: `tick ${produced}`,
            } as AssistantOperatorEvent
          }
        } finally {
          finallyRan = true
        }
      },
    })

    const reader = response.body!.getReader()
    await reader.read() // open
    await reader.read() // tick 1
    await reader.cancel()

    // 让被 abort 唤醒的那一轮跑完
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(finallyRan).toBe(true)
    expect(sawAbort).toBe(true)
    // 取消之后没有再多跑几十轮 —— 上限拿松一点，重点是它停了
    expect(produced).toBeLessThan(10)
  })

  it('上游 request signal abort 时同样传下去', async () => {
    const upstream = new AbortController()
    let sawAbort = false

    const response = toAssistantOperatorSseResponse({
      routeName: 'test',
      signal: upstream.signal,
      events: async function* (signal) {
        upstream.abort()
        await Promise.resolve()
        sawAbort = signal.aborted
        yield {
          type: ASSISTANT_OPERATOR_EVENTS.done,
        } as AssistantOperatorEvent
      },
    })

    await readFrames(response)
    expect(sawAbort).toBe(true)
  })
})

/** 按固定块长切一段原文 —— 模拟 provider 那边任意的分块边界。 */
function chunk(raw: string, size: number): string[] {
  const out: string[] = []
  for (let index = 0; index < raw.length; index += size) {
    out.push(raw.slice(index, index + size))
  }
  return out
}

function drain(raw: string, size: number): string[] {
  const streamer = createOperatorMessageStreamer()
  return chunk(raw, size)
    .map((piece) => streamer.push(piece))
    .filter(Boolean)
}

describe('createOperatorMessageStreamer', () => {
  it('收尾轮逐块解出 message，拼起来与原值一字不差', () => {
    const raw = JSON.stringify({
      finished: true,
      message: '好的，已经改成夜景了。其余参数没动。',
    })
    for (const size of [1, 3, 7, 64]) {
      expect(drain(raw, size).join('')).toBe(
        '好的，已经改成夜景了。其余参数没动。',
      )
    }
  })

  it('⛔ "tool" 先到就整轮闭嘴 —— 工具轮的旁白不逐字流', () => {
    const raw = JSON.stringify({
      tool: { name: 'set_prompt', args: { value: 'night' } },
      message: '这就来',
    })
    for (const size of [1, 5, 100]) expect(drain(raw, size)).toEqual([])
  })

  it('转义与换行按 JSON 语义还原，转义被块边界劈开也不丢字', () => {
    const text = '第一行\n第二行 "引号" 和反斜杠 \\ 结束'
    const raw = JSON.stringify({ message: text })
    for (const size of [1, 2, 3, 9])
      expect(drain(raw, size).join('')).toBe(text)
  })

  it('`\\uXXXX` 拆在两块里也解得出来（代理对同理）', () => {
    // ⚠ 手写而不是 `JSON.stringify`：后者不会把中文 / emoji 转成 `\u`。
    const raw = '{"message":"\\u4f60\\u597d\\ud83d\\ude00"}'
    for (const size of [1, 2, 4, 8])
      expect(drain(raw, size).join('')).toBe('你好😀')
  })

  it('字符串收尾之后不再吐 —— 后面的键不会被当成正文', () => {
    const raw = '{"message":"完","finished":true,"ruleHits":["r-1"]}'
    expect(drain(raw, 1).join('')).toBe('完')
  })

  it('围栏包着的 JSON 照样解得出来', () => {
    const raw = '```json\n{"finished":true,"message":"好"}\n```'
    expect(drain(raw, 2).join('')).toBe('好')
  })

  it('压根没有 message 的一轮一个字都不吐', () => {
    expect(drain('{"finished":true}', 1)).toEqual([])
  })
})
