import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { completion, stream, sendLog } = vi.hoisted(() => ({
  completion: vi.fn(),
  stream: vi.fn(),
  sendLog: vi.fn(async () => undefined),
}))

vi.mock('@/services/execution-worker.service', () => ({
  sendLlmCallLogToWorker: sendLog,
}))

vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: completion,
  llmTextStream: stream,
  isLlmTextContextLimitError: (error: unknown) =>
    error instanceof Error && error.message === 'context overflow',
  isLlmTextTransientError: (error: unknown) =>
    error instanceof Error && error.message === 'overloaded',
}))

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  completeAssistantTextWithContextRetry,
  streamAssistantTextWithContextRetry,
} from './assistant-completion.service'

const options = {
  systemPrompt: 'system',
  route: {
    adapterType: AI_ADAPTER_TYPES.OPENAI,
    providerConfig: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
    apiKey: 'test-key',
  },
  contextCompactionTargetLength: 20,
}

async function collect(chunks: AsyncIterable<string>) {
  const result: string[] = []
  for await (const chunk of chunks) result.push(chunk)
  return result
}

describe('assistant completion cancellation and context retry', () => {
  beforeEach(() => {
    completion.mockReset()
    stream.mockReset()
  })

  it.each(['completion', 'stream'] as const)(
    '%s does not dispatch a pre-cancelled request',
    async (mode) => {
      const controller = new AbortController()
      const reason = new DOMException('stopped', 'AbortError')
      controller.abort(reason)
      const buildUserPrompt = vi.fn(() => 'full')
      const input = { ...options, signal: controller.signal, buildUserPrompt }
      const result =
        mode === 'completion'
          ? completeAssistantTextWithContextRetry(input)
          : collect(streamAssistantTextWithContextRetry(input))
      await expect(result).rejects.toBe(reason)
      expect(buildUserPrompt).not.toHaveBeenCalled()
      expect(completion).not.toHaveBeenCalled()
      expect(stream).not.toHaveBeenCalled()
    },
  )

  it.each(['completion', 'stream'] as const)(
    '%s forwards cancellation to both context attempts',
    async (mode) => {
      const signal = new AbortController().signal
      const buildUserPrompt = vi.fn((limit?: number) =>
        limit ? 'compact' : 'full',
      )
      if (mode === 'completion') {
        completion.mockRejectedValueOnce(new Error('context overflow'))
        completion.mockResolvedValueOnce('answer')
      } else {
        stream.mockImplementationOnce(async function* () {
          throw new Error('context overflow')
        })
        stream.mockImplementationOnce(async function* () {
          yield 'answer'
        })
      }
      const input = { ...options, signal, buildUserPrompt }
      const result =
        mode === 'completion'
          ? await completeAssistantTextWithContextRetry(input)
          : await collect(streamAssistantTextWithContextRetry(input))
      expect(result).toEqual(mode === 'completion' ? 'answer' : ['answer'])
      const transport = mode === 'completion' ? completion : stream
      expect(transport).toHaveBeenCalledTimes(2)
      expect(transport).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ signal, userPrompt: 'full' }),
      )
      expect(transport).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ signal, userPrompt: 'compact' }),
      )
      expect(buildUserPrompt).toHaveBeenLastCalledWith(20)
    },
  )

  it.each(['completion', 'stream'] as const)(
    '%s does not compact or retry after cancellation even if the provider reports overflow',
    async (mode) => {
      const controller = new AbortController()
      const reason = new DOMException('stopped', 'AbortError')
      const buildUserPrompt = vi.fn(() => 'full')
      if (mode === 'completion') {
        completion.mockImplementationOnce(async () => {
          controller.abort(reason)
          throw new Error('context overflow')
        })
      } else {
        stream.mockImplementationOnce(async function* () {
          controller.abort(reason)
          throw new Error('context overflow')
        })
      }
      const input = { ...options, signal: controller.signal, buildUserPrompt }
      await expect(
        mode === 'completion'
          ? completeAssistantTextWithContextRetry(input)
          : collect(streamAssistantTextWithContextRetry(input)),
      ).rejects.toBe(reason)
      expect(buildUserPrompt).toHaveBeenCalledTimes(1)
      expect(mode === 'completion' ? completion : stream).toHaveBeenCalledTimes(
        1,
      )
    },
  )

  it.each(['completion', 'stream'] as const)(
    '%s resends the same prompt once after a transient provider outage',
    async (mode) => {
      vi.useFakeTimers()
      try {
        const buildUserPrompt = vi.fn(() => 'full')
        if (mode === 'completion') {
          completion.mockRejectedValueOnce(new Error('overloaded'))
          completion.mockResolvedValueOnce('answer')
        } else {
          stream.mockImplementationOnce(async function* () {
            throw new Error('overloaded')
          })
          stream.mockImplementationOnce(async function* () {
            yield 'answer'
          })
        }
        const input = { ...options, buildUserPrompt }
        const pending =
          mode === 'completion'
            ? completeAssistantTextWithContextRetry(input)
            : collect(streamAssistantTextWithContextRetry(input))
        await vi.runAllTimersAsync()
        await expect(pending).resolves.toEqual(
          mode === 'completion' ? 'answer' : ['answer'],
        )
        const transport = mode === 'completion' ? completion : stream
        expect(transport).toHaveBeenCalledTimes(2)
        expect(transport).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({ userPrompt: 'full' }),
        )
        expect(buildUserPrompt).toHaveBeenCalledTimes(1)
      } finally {
        vi.useRealTimers()
      }
    },
  )

  it('gives up after one transient retry', async () => {
    vi.useFakeTimers()
    try {
      const failure = new Error('overloaded')
      completion.mockRejectedValue(failure)
      const pending = completeAssistantTextWithContextRetry({
        ...options,
        buildUserPrompt: () => 'full',
      })
      const assertion = expect(pending).rejects.toBe(failure)
      await vi.runAllTimersAsync()
      await assertion
      expect(completion).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not retry a stream after visible text', async () => {
    const failure = new Error('context overflow')
    stream.mockImplementationOnce(async function* () {
      yield 'partial'
      throw failure
    })
    const buildUserPrompt = vi.fn(() => 'full')
    const iterator = streamAssistantTextWithContextRetry({
      ...options,
      buildUserPrompt,
    })[Symbol.asyncIterator]()
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: 'partial',
    })
    await expect(iterator.next()).rejects.toBe(failure)
    expect(stream).toHaveBeenCalledTimes(1)
    expect(buildUserPrompt).toHaveBeenCalledTimes(1)
  })

  it('drops a reply that completes after cancellation', async () => {
    const controller = new AbortController()
    const reason = new DOMException('stopped', 'AbortError')
    completion.mockImplementationOnce(async () => {
      controller.abort(reason)
      return 'late answer'
    })
    await expect(
      completeAssistantTextWithContextRetry({
        ...options,
        signal: controller.signal,
        buildUserPrompt: () => 'full',
      }),
    ).rejects.toBe(reason)
    expect(completion).toHaveBeenCalledTimes(1)
  })
})

describe('assistant llm call 日志（每次请求一行，只记录）', () => {
  /** 走真的 logger，连脱敏一起验：`*token` 结尾的字段会被打成 [REDACTED]。 */
  function loggedCalls(spy: { mock: { calls: unknown[][] } }) {
    return spy.mock.calls
      .map(([line]) => String(line))
      .filter((line) => line.includes('assistant llm call'))
      .map(
        (line) =>
          JSON.parse(line.slice(line.indexOf('{'))) as Record<string, unknown>,
      )
  }

  beforeEach(() => {
    completion.mockReset()
    stream.mockReset()
    sendLog.mockReset()
    sendLog.mockResolvedValue(undefined)
  })

  it('completion: provider 报的 token 原样进日志，带用途', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      completion.mockImplementationOnce(
        async (input: { onUsage?: (usage: object) => void }) => {
          input.onUsage?.({ inputTokens: 26000, outputTokens: 12000 })
          return 'answer'
        },
      )
      await completeAssistantTextWithContextRetry({
        ...options,
        modelId: 'deepseek-v4.1-flash',
        buildUserPrompt: () => 'full',
        callLog: { purpose: 'promptReview', domain: 'canvas' },
      })
      expect(loggedCalls(consoleLog)).toEqual([
        expect.objectContaining({
          purpose: 'promptReview',
          domain: 'canvas',
          adapterType: AI_ADAPTER_TYPES.OPENAI,
          modelId: 'deepseek-v4.1-flash',
          attempt: 1,
          outcome: 'ok',
          usageReported: true,
          inputTokens: 26000,
          outputTokens: 12000,
          llmMs: expect.any(Number),
        }),
      ])
    } finally {
      consoleLog.mockRestore()
    }
  })

  it('stream: 重发的两次各一行；没报 token 的那次标 usageReported:false', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      stream.mockImplementationOnce(async function* () {
        throw new Error('context overflow')
      })
      stream.mockImplementationOnce(async function* (input: {
        onUsage?: (usage: object) => void
      }) {
        yield 'answer'
        input.onUsage?.({ inputTokens: 9000, reasoningTokens: 800 })
      })
      await collect(
        streamAssistantTextWithContextRetry({
          ...options,
          buildUserPrompt: (limit?: number) => (limit ? 'compact' : 'full'),
          callLog: { purpose: 'step', domain: 'canvas', step: 3 },
        }),
      )
      const calls = loggedCalls(consoleLog)
      expect(calls).toEqual([
        expect.objectContaining({
          step: 3,
          attempt: 1,
          outcome: 'error',
          usageReported: false,
        }),
        expect.objectContaining({
          step: 3,
          attempt: 2,
          outcome: 'ok',
          usageReported: true,
          inputTokens: 9000,
          reasoningTokens: 800,
        }),
      ])
      expect(calls[0]).not.toHaveProperty('inputTokens')
    } finally {
      consoleLog.mockRestore()
    }
  })

  it('stream: 被掐断（⏹ / 时间预算）记成 aborted', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const controller = new AbortController()
      stream.mockImplementationOnce(async function* () {
        yield 'partial'
        yield 'more'
      })
      const iterator = streamAssistantTextWithContextRetry({
        ...options,
        signal: controller.signal,
        buildUserPrompt: () => 'full',
        callLog: { purpose: 'step' },
      })[Symbol.asyncIterator]()
      await iterator.next()
      controller.abort(new DOMException('stopped', 'AbortError'))
      await expect(iterator.next()).rejects.toMatchObject({
        name: 'AbortError',
      })
      expect(loggedCalls(consoleLog)).toEqual([
        expect.objectContaining({ outcome: 'aborted', usageReported: false }),
      ])
    } finally {
      consoleLog.mockRestore()
    }
  })

  it('同一行转给 execution worker；发失败只记一条 warn，不影响回答', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      sendLog.mockRejectedValueOnce(new Error('worker down'))
      completion.mockImplementationOnce(
        async (input: { onUsage?: (usage: object) => void }) => {
          input.onUsage?.({ inputTokens: 100, outputTokens: 20 })
          return 'answer'
        },
      )
      await expect(
        completeAssistantTextWithContextRetry({
          ...options,
          buildUserPrompt: () => 'full',
          callLog: { purpose: 'roundSummary' },
        }),
      ).resolves.toBe('answer')
      expect(sendLog).toHaveBeenCalledWith(
        expect.objectContaining({
          purpose: 'roundSummary',
          outcome: 'ok',
          inputTokens: 100,
          outputTokens: 20,
        }),
      )
      await vi.waitFor(() =>
        expect(
          consoleWarn.mock.calls.some(([line]) =>
            String(line).includes('assistant llm call log not shipped'),
          ),
        ).toBe(true),
      )
    } finally {
      consoleLog.mockRestore()
      consoleWarn.mockRestore()
    }
  })
})
