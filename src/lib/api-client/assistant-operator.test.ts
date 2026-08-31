import { describe, expect, it, vi, afterEach } from 'vitest'

import { ASSISTANT_OPERATOR_EVENTS } from '@/constants/assistant-operator'
import { API_ENDPOINTS } from '@/constants/config'
import {
  readAssistantOperatorStream,
  streamAssistantOperatorAPI,
} from '@/lib/api-client/assistant-operator'
import { encodeSseEvent } from '@/lib/sse'
import type {
  AssistantOperatorEvent,
  AssistantOperatorRequest,
} from '@/types/assistant-operator'

function toStream(chunks: readonly string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

async function collect(
  stream: ReadableStream<Uint8Array>,
): Promise<AssistantOperatorEvent[]> {
  const events: AssistantOperatorEvent[] = []
  for await (const event of readAssistantOperatorStream(stream)) {
    events.push(event)
  }
  return events
}

const REQUEST: AssistantOperatorRequest = {
  messages: [{ role: 'user', content: '帮我配好这张图' }],
  domain: 'image',
  snapshot: { prompt: '', availableModels: [] },
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('readAssistantOperatorStream', () => {
  it('逐帧吐出校验过的事件', async () => {
    const events = await collect(
      toStream([
        encodeSseEvent(ASSISTANT_OPERATOR_EVENTS.open, {
          type: ASSISTANT_OPERATOR_EVENTS.open,
        }),
        encodeSseEvent(ASSISTANT_OPERATOR_EVENTS.plan, {
          type: ASSISTANT_OPERATOR_EVENTS.plan,
          steps: ['读工作台', '搜素材'],
        }),
        encodeSseEvent(ASSISTANT_OPERATOR_EVENTS.done, {
          type: ASSISTANT_OPERATOR_EVENTS.done,
        }),
      ]),
    )
    expect(events.map((event) => event.type)).toEqual(['open', 'plan', 'done'])
  })

  it('一帧坏载荷只丢那一帧，后面的照读 —— 表单已经被改了一半，整轮作废更糟', async () => {
    const events = await collect(
      toStream([
        'event: plan\ndata: {不是 JSON\n\n',
        encodeSseEvent(ASSISTANT_OPERATOR_EVENTS.plan, {
          type: ASSISTANT_OPERATOR_EVENTS.plan,
          // steps 必须 min(1) —— 这一帧过不了 schema，同样只丢它自己
          steps: [],
        }),
        encodeSseEvent(ASSISTANT_OPERATOR_EVENTS.message, {
          type: ASSISTANT_OPERATOR_EVENTS.message,
          text: '好了',
        }),
      ]),
    )
    expect(events).toEqual([{ type: 'message', text: '好了' }])
  })

  it('认不得的事件名不会让读流崩掉（服务端将来多发一种帧）', async () => {
    const events = await collect(
      toStream([
        encodeSseEvent('future_frame', { type: 'future_frame' }),
        encodeSseEvent(ASSISTANT_OPERATOR_EVENTS.done, {
          type: ASSISTANT_OPERATOR_EVENTS.done,
        }),
      ]),
    )
    expect(events).toEqual([{ type: 'done' }])
  })

  it('chunk 边界落在帧中间也读得出来', async () => {
    const frame = encodeSseEvent(ASSISTANT_OPERATOR_EVENTS.message, {
      type: ASSISTANT_OPERATOR_EVENTS.message,
      text: '切开的一帧',
    })
    const events = await collect(
      toStream([frame.slice(0, 12), frame.slice(12)]),
    )
    expect(events).toEqual([{ type: 'message', text: '切开的一帧' }])
  })
})

describe('streamAssistantOperatorAPI', () => {
  it('把 signal 一路传到 fetch —— 只在读循环里 break 掐不断服务端那几步 LLM 往返', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(toStream([]), {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const controller = new AbortController()
    const result = await streamAssistantOperatorAPI(REQUEST, {
      signal: controller.signal,
    })

    expect(result.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(call[0]).toBe(API_ENDPOINTS.STUDIO_ASSISTANT_OPERATOR)
    expect(call[1].signal).toBe(controller.signal)
  })

  it('abort 报的是 ABORTED —— 用户按的停不该在线程里变成一条红字', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new DOMException('aborted', 'AbortError')
    })
    const result = await streamAssistantOperatorAPI(REQUEST)
    expect(result).toMatchObject({ success: false, errorCode: 'ABORTED' })
  })

  it('非 2xx 时把服务端的 errorCode / i18nKey 原样带出来', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json(
        { error: '超额了', errorCode: 'RATE_LIMIT_EXCEEDED', i18nKey: 'x.y' },
        { status: 429 },
      ),
    )
    const result = await streamAssistantOperatorAPI(REQUEST)
    expect(result).toEqual({
      success: false,
      error: '超额了',
      errorCode: 'RATE_LIMIT_EXCEEDED',
      i18nKey: 'x.y',
    })
  })
})
