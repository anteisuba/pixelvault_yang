import { describe, expect, it } from 'vitest'

import {
  encodeSseEvent,
  parseSseStream,
  readSseData,
  SSE_DEFAULT_EVENT,
  type SseFrame,
} from '@/lib/sse'

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

async function collect(body: ReadableStream<Uint8Array>): Promise<SseFrame[]> {
  const frames: SseFrame[] = []
  for await (const frame of parseSseStream(body)) frames.push(frame)
  return frames
}

describe('SSE 帧编解码', () => {
  it('编出来的一帧能原样解回来', async () => {
    const encoded = encodeSseEvent('text', { delta: '你好' })
    const frames = await collect(streamOf([encoded]))

    expect(frames).toEqual([{ event: 'text', data: '{"delta":"你好"}' }])
  })

  it('⭐ 载荷里的换行不会把一帧拆成好几帧', async () => {
    // 这是助手流换协议时最容易踩的地方：正文满是换行，而换行在 SSE 里是分隔符。
    // 载荷一律 JSON 序列化（`\n` 被转义成两个字符），所以一帧还是一帧。
    const body = '第一段。\n\n第二段。\n第三段。'
    const frames = await collect(
      streamOf([encodeSseEvent('text', { delta: body })]),
    )

    expect(frames).toHaveLength(1)
    expect(JSON.parse(frames[0]!.data)).toEqual({ delta: body })
  })

  it('chunk 边界落在一行中间也能拼回来', async () => {
    const encoded = encodeSseEvent('text', { delta: '一二三' })
    const cut = Math.floor(encoded.length / 2)
    const frames = await collect(
      streamOf([encoded.slice(0, cut), encoded.slice(cut)]),
    )

    expect(frames).toEqual([{ event: 'text', data: '{"delta":"一二三"}' }])
  })

  it('chunk 边界落在两帧中间也能拼回来', async () => {
    const a = encodeSseEvent('text', { delta: 'A' })
    const b = encodeSseEvent('text', { delta: 'B' })
    const joined = a + b
    const cut = a.length - 1
    const frames = await collect(
      streamOf([joined.slice(0, cut), joined.slice(cut)]),
    )

    expect(frames.map((f) => JSON.parse(f.data))).toEqual([
      { delta: 'A' },
      { delta: 'B' },
    ])
  })

  it('事件名不跨帧继承 —— 下一帧没写 event 就落回 message', async () => {
    const frames = await collect(
      streamOf(['event: text\ndata: {"a":1}\n\n', 'data: {"b":2}\n\n']),
    )

    expect(frames).toEqual([
      { event: 'text', data: '{"a":1}' },
      { event: SSE_DEFAULT_EVENT, data: '{"b":2}' },
    ])
  })

  it('`\\r\\n` 行尾照样认，注释帧（心跳）整行丢掉', async () => {
    const frames = await collect(
      streamOf([
        ': keep-alive\r\n\r\n',
        'event: text\r\ndata: {"x":1}\r\n\r\n',
      ]),
    )

    expect(frames).toEqual([{ event: 'text', data: '{"x":1}' }])
  })

  it('多个 data 行按规范用 \\n 连接', async () => {
    const frames = await collect(streamOf(['data: one\ndata: two\n\n']))

    expect(frames).toEqual([{ event: SSE_DEFAULT_EVENT, data: 'one\ntwo' }])
  })

  it('只去掉一个前导空格 —— 载荷自己的空格是内容', async () => {
    const frames = await collect(streamOf(['data:  两个空格开头\n\n']))

    expect(frames[0]?.data).toBe(' 两个空格开头')
  })

  it('最后一帧没有以空行收尾也不丢', async () => {
    // 丢掉的表现是「最后一句话有时候会少」，比多吐一帧难查得多。
    const frames = await collect(streamOf(['event: text\ndata: {"last":true}']))

    expect(frames).toEqual([{ event: 'text', data: '{"last":true}' }])
  })

  it('readSseData：provider 的流没有事件名，只要 data 原文', async () => {
    // OpenAI / Gemini / Anthropic 都走这条 —— 它们只发 `data:` 行。
    const seen: string[] = []
    for await (const data of readSseData(
      streamOf(['data: {"choices":[]}\n\n', 'data: [DONE]\n\n']),
    )) {
      seen.push(data)
    }

    expect(seen).toEqual(['{"choices":[]}', '[DONE]'])
  })
})
