import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import {
  ASSISTANT_OPERATOR_EVENTS,
  ASSISTANT_OPERATOR_INTERNAL_ERROR_CODE,
} from '@/constants/assistant-operator'
import { ASSISTANT_STREAM_CONTENT_TYPE } from '@/constants/assistant-stream'
import {
  ASSISTANT_OPERATOR_FALLBACK_ERROR,
  toAssistantOperatorSseResponse,
} from '@/lib/assistant-operator-stream'
import { ApiRequestError } from '@/lib/errors'
import { logger } from '@/lib/logger'
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
          steps: [{ id: 'plan-1', label: 'a' }],
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

  /**
   * ── 错误要说得出原因（owner 2026-09-20 真机第 1 条）─────────────────
   * 非 `GenerationError` 那一族此前只回一句兜底，用户屏幕与服务端日志之间
   * 没有任何一根线。现在那一档带一个八位 `traceId`，非生产再带原始 message。
   */
  it('非 GenerationError 带一个八位 traceId，且与日志里那一行是同一个值', async () => {
    const response = toAssistantOperatorSseResponse({
      routeName: 'test',
      events: async function* () {
        throw new TypeError(
          "Cannot read properties of undefined (reading 'findMany')",
        )
      },
    })

    const frames = await readFrames(response)
    const error = frames.at(-1)?.data as {
      errorCode?: string
      traceId?: string
    }
    expect(error.errorCode).toBe(ASSISTANT_OPERATOR_INTERNAL_ERROR_CODE)
    expect(error.traceId).toMatch(/^[0-9a-f]{8}$/)
    const logged = vi.mocked(logger.error).mock.calls.at(-1)?.[1] as {
      traceId?: string
      stack?: string
    }
    expect(logged.traceId).toBe(error.traceId)
    // stack 只进日志。
    expect(logged.stack).toContain('TypeError')
  })

  it('非生产环境带原始 message；生产环境不带 detail、更不带 stack', async () => {
    const run = async () => {
      const response = toAssistantOperatorSseResponse({
        routeName: 'test',
        events: async function* () {
          throw new Error('table is missing')
        },
      })
      const frames = await readFrames(response)
      return frames.at(-1)?.data as { detail?: string; traceId?: string }
    }

    const dev = await run()
    expect(dev.detail).toBe('table is missing')

    vi.stubEnv('NODE_ENV', 'production')
    const prod = await run()
    expect(prod.detail).toBeUndefined()
    expect(JSON.stringify(prod)).not.toContain('at ')
    // 短码在生产照旧有 —— 它正是生产里唯一的那根线。
    expect(prod.traceId).toMatch(/^[0-9a-f]{8}$/)
    vi.unstubAllEnvs()
  })

  it('GenerationError 那一族不编短码（它本来就说得出原因）', async () => {
    const response = toAssistantOperatorSseResponse({
      routeName: 'test',
      events: async function* () {
        throw new ApiRequestError(
          'invalid_api_key',
          401,
          'Errors.generation.invalid_api_key',
          'bad key',
        )
      },
    })

    const frames = await readFrames(response)
    const error = frames.at(-1)?.data as {
      errorCode?: string
      traceId?: string
      detail?: string
    }
    expect(error.errorCode).toBe('invalid_api_key')
    expect(error.traceId).toBeUndefined()
    expect(error.detail).toBeUndefined()
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
