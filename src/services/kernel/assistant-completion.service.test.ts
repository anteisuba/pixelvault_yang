import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { completion, stream } = vi.hoisted(() => ({
  completion: vi.fn(),
  stream: vi.fn(),
}))

vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: completion,
  llmTextStream: stream,
  isLlmTextContextLimitError: (error: unknown) =>
    error instanceof Error && error.message === 'context overflow',
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
