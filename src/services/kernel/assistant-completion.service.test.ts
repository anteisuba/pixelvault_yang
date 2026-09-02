import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mockLlmTextCompletion = vi.fn()
const mockLlmTextStream = vi.fn()
const mockIsLlmTextContextLimitError = vi.fn()
vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: (...args: unknown[]) => mockLlmTextCompletion(...args),
  llmTextStream: (...args: unknown[]) => mockLlmTextStream(...args),
  isLlmTextContextLimitError: (...args: unknown[]) =>
    mockIsLlmTextContextLimitError(...args),
}))

import {
  completeAssistantTextWithContextRetry,
  streamAssistantTextWithContextRetry,
} from '@/services/kernel/assistant-completion.service'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

const ROUTE = {
  adapterType: AI_ADAPTER_TYPES.XAI,
  providerConfig: { label: 'Grok', baseUrl: 'https://api.x.ai/v1' },
  apiKey: 'test-key',
} as const

const FULL_PROMPT = 'full prompt'
const COMPACT_PROMPT = 'compact prompt'

function baseOptions(signal?: AbortSignal) {
  return {
    systemPrompt: 'sys',
    buildUserPrompt: (maxLength?: number) =>
      maxLength === undefined ? FULL_PROMPT : COMPACT_PROMPT,
    route: ROUTE,
    contextCompactionTargetLength: 100,
    signal,
  }
}

function abortedSignal(): AbortSignal {
  const controller = new AbortController()
  controller.abort()
  return controller.signal
}

async function* emptyStream(): AsyncIterable<string> {}

async function* streamOf(...chunks: string[]): AsyncIterable<string> {
  for (const chunk of chunks) yield chunk
}

async function* failingStream(error: unknown): AsyncIterable<string> {
  await Promise.resolve()
  throw error
}

async function collect(stream: AsyncIterable<string>): Promise<string[]> {
  const chunks: string[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

beforeEach(() => {
  vi.clearAllMocks()
  mockIsLlmTextContextLimitError.mockReturnValue(false)
})

describe('completeAssistantTextWithContextRetry', () => {
  it('把 signal 原样转给 LlmTextInput', async () => {
    mockLlmTextCompletion.mockResolvedValue('ok')
    const controller = new AbortController()

    await completeAssistantTextWithContextRetry(baseOptions(controller.signal))

    expect(mockLlmTextCompletion).toHaveBeenCalledTimes(1)
    expect(mockLlmTextCompletion.mock.calls[0]?.[0]).toMatchObject({
      userPrompt: FULL_PROMPT,
      signal: controller.signal,
    })
  })

  it('超上下文 → 压缩重试一次（回归）', async () => {
    const contextError = new Error('context limit')
    mockLlmTextCompletion
      .mockRejectedValueOnce(contextError)
      .mockResolvedValueOnce('compacted ok')
    mockIsLlmTextContextLimitError.mockReturnValue(true)

    await expect(
      completeAssistantTextWithContextRetry(baseOptions()),
    ).resolves.toBe('compacted ok')

    expect(mockLlmTextCompletion).toHaveBeenCalledTimes(2)
    expect(mockLlmTextCompletion.mock.calls[1]?.[0]).toMatchObject({
      userPrompt: COMPACT_PROMPT,
    })
  })

  it('signal 已触发：即使错误被归为超上下文也不重试，原样抛', async () => {
    const signal = abortedSignal()
    mockLlmTextCompletion.mockRejectedValue(signal.reason)
    mockIsLlmTextContextLimitError.mockReturnValue(true)

    await expect(
      completeAssistantTextWithContextRetry(baseOptions(signal)),
    ).rejects.toBe(signal.reason)

    expect(mockLlmTextCompletion).toHaveBeenCalledTimes(1)
  })
})

describe('streamAssistantTextWithContextRetry', () => {
  it('把 signal 原样转给 LlmTextInput', async () => {
    mockLlmTextStream.mockReturnValue(streamOf('a', 'b'))
    const controller = new AbortController()

    await expect(
      collect(
        streamAssistantTextWithContextRetry(baseOptions(controller.signal)),
      ),
    ).resolves.toEqual(['a', 'b'])

    expect(mockLlmTextStream).toHaveBeenCalledTimes(1)
    expect(mockLlmTextStream.mock.calls[0]?.[0]).toMatchObject({
      userPrompt: FULL_PROMPT,
      signal: controller.signal,
    })
  })

  it('吐字前超上下文 → 压缩重试一次（回归）', async () => {
    mockLlmTextStream
      .mockReturnValueOnce(failingStream(new Error('context limit')))
      .mockReturnValueOnce(streamOf('compacted'))
    mockIsLlmTextContextLimitError.mockReturnValue(true)

    await expect(
      collect(streamAssistantTextWithContextRetry(baseOptions())),
    ).resolves.toEqual(['compacted'])

    expect(mockLlmTextStream).toHaveBeenCalledTimes(2)
    expect(mockLlmTextStream.mock.calls[1]?.[0]).toMatchObject({
      userPrompt: COMPACT_PROMPT,
    })
  })

  it('signal 已触发：即使错误被归为超上下文也不重试，原样抛', async () => {
    const signal = abortedSignal()
    mockLlmTextStream.mockReturnValue(failingStream(signal.reason))
    mockIsLlmTextContextLimitError.mockReturnValue(true)

    await expect(
      collect(streamAssistantTextWithContextRetry(baseOptions(signal))),
    ).rejects.toBe(signal.reason)

    expect(mockLlmTextStream).toHaveBeenCalledTimes(1)
  })

  it('没有 signal 且流为空：不重试、不报错', async () => {
    mockLlmTextStream.mockReturnValue(emptyStream())

    await expect(
      collect(streamAssistantTextWithContextRetry(baseOptions())),
    ).resolves.toEqual([])
    expect(mockLlmTextStream).toHaveBeenCalledTimes(1)
  })
})
