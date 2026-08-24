import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import { ASSISTANT_STREAM_EVENTS } from '@/constants/assistant-stream'
import { ApiRequestError } from '@/lib/errors'
import { toAssistantSseResponse } from '@/lib/assistant-stream'
import {
  readAssistantStream,
  type AssistantStreamMessage,
} from '@/lib/assistant-stream-client'
import { parseSseStream } from '@/lib/sse'

async function* textOf(chunks: string[]): AsyncIterable<string> {
  for (const chunk of chunks) yield chunk
}

async function frameNames(response: Response): Promise<string[]> {
  const names: string[] = []
  for await (const frame of parseSseStream(response.body!)) {
    names.push(frame.event)
  }
  return names
}

async function clientMessages(
  response: Response,
): Promise<AssistantStreamMessage[]> {
  const messages: AssistantStreamMessage[] = []
  for await (const message of readAssistantStream(response.body!)) {
    messages.push(message)
  }
  return messages
}

const RESEARCH = {
  runId: 'run_1',
  grounded: true,
  status: 'succeeded' as const,
  perSource: [],
  queries: ['长离 发色'],
  evidenceCount: 2,
}

describe('助手流成帧', () => {
  it('响应头声明 SSE，并关掉反代的缓冲', async () => {
    const response = toAssistantSseResponse({
      text: textOf(['ok']),
      routeName: 'test',
    })

    expect(response.headers.get('Content-Type')).toContain('text/event-stream')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    // 攒了缓冲区就等于没有流。
    expect(response.headers.get('X-Accel-Buffering')).toBe('no')
  })

  it('⭐ open 是第一帧 —— 这一帧的字节就是 504 不再发生的原因', async () => {
    // 2026-08-24 生产实证：裸文本流在模型开口之前一个字节都没有，响应头因此从未
    // flush，函数被杀时网关只能回 504。把 open 挪到模型开口之后 = 把它请回来。
    const response = toAssistantSseResponse({
      text: textOf(['甲', '乙']),
      routeName: 'test',
    })

    expect(await frameNames(response)).toEqual([
      ASSISTANT_STREAM_EVENTS.open,
      ASSISTANT_STREAM_EVENTS.text,
      ASSISTANT_STREAM_EVENTS.text,
      ASSISTANT_STREAM_EVENTS.done,
    ])
  })

  it('⭐ 模型一个字都还没吐时，open 帧已经出去了', async () => {
    // 引用闸那条路径会整段缓冲几十秒才产出第一个字。这条断言锁的就是那种情形：
    // 只读第一帧，不等文本。
    let released!: () => void
    const gate = new Promise<void>((resolve) => {
      released = resolve
    })
    async function* blocked(): AsyncIterable<string> {
      await gate
      yield '终于写完了'
    }

    const response = toAssistantSseResponse({
      text: blocked(),
      routeName: 'test',
    })
    const iterator = parseSseStream(response.body!)[Symbol.asyncIterator]()
    const first = await iterator.next()

    expect(first.value?.event).toBe(ASSISTANT_STREAM_EVENTS.open)
    released()
  })

  it('research / lora 排在第一个 text 之前 —— 推荐卡不会「先出来名字后到」', async () => {
    const response = toAssistantSseResponse({
      text: textOf(['这几把比较贴']),
      research: RESEARCH,
      loraCandidates: {
        candidates: [
          {
            candidateId: 'civitai:1:1',
            name: '长离',
            source: 'civitai',
            sampleImageUrls: [],
            metadataCompleteness: 'full',
          },
        ],
        query: '长离 lora',
        sources: [],
      } as never,
      routeName: 'test',
    })

    expect(await frameNames(response)).toEqual([
      ASSISTANT_STREAM_EVENTS.open,
      ASSISTANT_STREAM_EVENTS.research,
      ASSISTANT_STREAM_EVENTS.lora,
      ASSISTANT_STREAM_EVENTS.text,
      ASSISTANT_STREAM_EVENTS.done,
    ])
  })

  it('候选为空时不发 lora 帧', async () => {
    const response = toAssistantSseResponse({
      text: textOf(['没找到']),
      loraCandidates: { candidates: [], query: 'x', sources: [] } as never,
      routeName: 'test',
    })

    expect(await frameNames(response)).not.toContain(
      ASSISTANT_STREAM_EVENTS.lora,
    )
  })

  it('中途抛错：已发的 text 帧留下，尾巴是一帧 error 而不是把流打断', async () => {
    async function* exploding(): AsyncIterable<string> {
      yield '已经写了半句'
      throw new ApiRequestError(
        'PROVIDER_TIMEOUT',
        504,
        'errors.provider.timeout',
        'The selected provider did not answer in time.',
      )
    }

    const messages = await clientMessages(
      toAssistantSseResponse({ text: exploding(), routeName: 'test' }),
    )

    expect(messages).toEqual([
      { type: 'text', delta: '已经写了半句' },
      {
        type: 'error',
        error: 'The selected provider did not answer in time.',
        errorCode: 'PROVIDER_TIMEOUT',
        i18nKey: 'errors.provider.timeout',
      },
    ])
  })

  it('非 GenerationError 也出 error 帧，只是没有具体原因可报', async () => {
    async function* exploding(): AsyncIterable<string> {
      yield '半句'
      throw new Error('socket hang up')
    }

    const messages = await clientMessages(
      toAssistantSseResponse({ text: exploding(), routeName: 'test' }),
    )

    expect(messages.at(-1)).toMatchObject({
      type: 'error',
      errorCode: 'ASSISTANT_STREAM_FAILED',
    })
    // ⛔ 上游的原始错误消息不外泄给用户 —— 它可能带内部地址/栈信息。
    expect(JSON.stringify(messages)).not.toContain('socket hang up')
  })
})

describe('助手流读帧（客户端）', () => {
  it('服务端成帧 → 客户端读回，一个来回不丢东西', async () => {
    const response = toAssistantSseResponse({
      text: textOf(['第一段。\n\n', '第二段。']),
      research: RESEARCH,
      routeName: 'test',
    })

    expect(await clientMessages(response)).toEqual([
      { type: 'research', receipt: RESEARCH },
      { type: 'text', delta: '第一段。\n\n' },
      { type: 'text', delta: '第二段。' },
    ])
  })

  it('坏载荷只丢那一帧，正文照读 —— 一帧坏了不该让整条对话失败', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder()
        controller.enqueue(encoder.encode('event: text\ndata: {坏掉的\n\n'))
        controller.enqueue(
          encoder.encode('event: research\ndata: {"shape":"wrong"}\n\n'),
        )
        controller.enqueue(
          encoder.encode('event: text\ndata: {"delta":"活着的正文"}\n\n'),
        )
        controller.close()
      },
    })

    const messages: AssistantStreamMessage[] = []
    for await (const message of readAssistantStream(body))
      messages.push(message)

    expect(messages).toEqual([{ type: 'text', delta: '活着的正文' }])
  })

  it('认不得的事件名跳过 —— 服务端将来多发一种帧，老客户端不会崩', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder()
        controller.enqueue(encoder.encode('event: future-thing\ndata: {}\n\n'))
        controller.enqueue(
          encoder.encode('event: text\ndata: {"delta":"ok"}\n\n'),
        )
        controller.close()
      },
    })

    const messages: AssistantStreamMessage[] = []
    for await (const message of readAssistantStream(body))
      messages.push(message)

    expect(messages).toEqual([{ type: 'text', delta: 'ok' }])
  })
})
