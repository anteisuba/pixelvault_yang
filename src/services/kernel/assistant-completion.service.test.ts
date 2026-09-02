import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mockLlmTextCompletion = vi.fn()
const mockLlmTextStream = vi.fn()
const mockLlmTextToolCall = vi.fn()
const mockIsLlmTextContextLimitError = vi.fn()
vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: (...args: unknown[]) => mockLlmTextCompletion(...args),
  llmTextStream: (...args: unknown[]) => mockLlmTextStream(...args),
  llmTextToolCall: (...args: unknown[]) => mockLlmTextToolCall(...args),
  isLlmTextContextLimitError: (...args: unknown[]) =>
    mockIsLlmTextContextLimitError(...args),
}))

import {
  completeAssistantTextWithContextRetry,
  requestToolCallWithContextRetry,
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

// ─── T（原生 tool-calling）带来的那组：两条路共用同一条压缩重试策略 ───

const COMPACTION_TARGET = 40

/** 一份「全量很长、压缩很短」的提示构造器 —— 压缩重试的唯一可观测输入。 */
function buildUserPrompt(maxLength?: number): string {
  return maxLength === undefined ? 'FULL-CONTEXT'.repeat(20) : 'COMPACTED'
}

const BASE = {
  systemPrompt: 'sys',
  buildUserPrompt,
  route: ROUTE,
  contextCompactionTargetLength: COMPACTION_TARGET,
}

function contextLimitError(): Error {
  return new Error('input context too long')
}

/**
 * 上下文压缩重试的**策略本身**（`withContextRetry`）。
 *
 * ⭐ 它没有被导出 —— 有意的：它是一条策略，不是一个 API。这一组用它的两个消费者
 * （文本补全 / 原生工具调用）从外面证明**两条路走的是同一条策略**。哪天有人给
 * 其中一条偷偷改了重试次数，这里就红。
 */
describe('withContextRetry — 两条路共用一条压缩重试策略', () => {
  it('文本路：没报超限就只发一次，发的是全量上下文', async () => {
    mockLlmTextCompletion.mockResolvedValue('ok')

    await expect(completeAssistantTextWithContextRetry(BASE)).resolves.toBe(
      'ok',
    )

    expect(mockLlmTextCompletion).toHaveBeenCalledTimes(1)
    expect(mockLlmTextCompletion.mock.calls[0]?.[0]).toMatchObject({
      userPrompt: buildUserPrompt(),
    })
  })

  it('文本路：报了超限就压缩重试一次，第二次发的是压过的串', async () => {
    mockIsLlmTextContextLimitError.mockReturnValue(true)
    mockLlmTextCompletion
      .mockRejectedValueOnce(contextLimitError())
      .mockResolvedValueOnce('recovered')

    await expect(completeAssistantTextWithContextRetry(BASE)).resolves.toBe(
      'recovered',
    )

    expect(mockLlmTextCompletion).toHaveBeenCalledTimes(2)
    expect(mockLlmTextCompletion.mock.calls[1]?.[0]).toMatchObject({
      userPrompt: 'COMPACTED',
    })
  })

  it('不是超限的错就原样抛，一次都不重试', async () => {
    const boom = new Error('provider is down')
    mockLlmTextCompletion.mockRejectedValue(boom)

    await expect(completeAssistantTextWithContextRetry(BASE)).rejects.toBe(boom)
    expect(mockLlmTextCompletion).toHaveBeenCalledTimes(1)
  })

  /** ⛔ 压不动就别重发：一模一样的请求再发一次只是多花一次钱。 */
  it('压缩后跟全量一模一样时抛原错，不再发第二次', async () => {
    mockIsLlmTextContextLimitError.mockReturnValue(true)
    const boom = contextLimitError()
    mockLlmTextCompletion.mockRejectedValue(boom)

    await expect(
      completeAssistantTextWithContextRetry({
        ...BASE,
        buildUserPrompt: () => 'INCOMPRESSIBLE',
      }),
    ).rejects.toBe(boom)
    expect(mockLlmTextCompletion).toHaveBeenCalledTimes(1)
  })

  it('工具路：同一条策略 —— 超限压缩重试一次，第二次带同一份工具表', async () => {
    mockIsLlmTextContextLimitError.mockReturnValue(true)
    const tools = [
      { name: 'set_prompt', description: 'write it', parameters: {} },
    ]
    mockLlmTextToolCall
      .mockRejectedValueOnce(contextLimitError())
      .mockResolvedValueOnce({ kind: 'tool', name: 'set_prompt', args: {} })

    await expect(
      requestToolCallWithContextRetry({ ...BASE, tools }),
    ).resolves.toEqual({ kind: 'tool', name: 'set_prompt', args: {} })

    expect(mockLlmTextToolCall).toHaveBeenCalledTimes(2)
    expect(mockLlmTextToolCall.mock.calls[1]?.[0]).toMatchObject({
      userPrompt: 'COMPACTED',
      tools,
    })
  })

  it('工具路：不是超限的错也原样抛，一次都不重试', async () => {
    const boom = new Error('native tool calling unsupported')
    mockLlmTextToolCall.mockRejectedValue(boom)

    await expect(
      requestToolCallWithContextRetry({ ...BASE, tools: [] }),
    ).rejects.toBe(boom)
    expect(mockLlmTextToolCall).toHaveBeenCalledTimes(1)
  })

  /**
   * ⛔ 原生工具路**永不发 `response_format`**：强制 JSON 输出与工具调用互斥。
   * 类型上已经挡掉（`RequestToolCallOptions` Omit 了它），这里再从行为上锁一道。
   */
  it('工具路发出去的入参里没有 responseFormat', async () => {
    mockLlmTextToolCall.mockResolvedValue({ kind: 'text', text: 'done' })

    await requestToolCallWithContextRetry({ ...BASE, tools: [] })

    expect(mockLlmTextToolCall.mock.calls[0]?.[0]).not.toHaveProperty(
      'responseFormat',
    )
  })
})
