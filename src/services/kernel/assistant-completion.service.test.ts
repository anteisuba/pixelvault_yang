import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mockLlmTextCompletion = vi.fn()
const mockLlmTextToolCall = vi.fn()
const mockIsContextLimitError = vi.fn()
vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: (...args: unknown[]) => mockLlmTextCompletion(...args),
  llmTextToolCall: (...args: unknown[]) => mockLlmTextToolCall(...args),
  llmTextStream: vi.fn(),
  isLlmTextContextLimitError: (error: unknown) =>
    mockIsContextLimitError(error) as boolean,
}))

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  completeAssistantTextWithContextRetry,
  requestToolCallWithContextRetry,
} from '@/services/kernel/assistant-completion.service'
import type { ResolvedLlmTextRoute } from '@/services/llm-text.service'

const ROUTE: ResolvedLlmTextRoute = {
  adapterType: AI_ADAPTER_TYPES.OPENAI,
  providerConfig: { label: 'OpenAI', baseUrl: 'https://example.test' },
  apiKey: 'sk-test',
}

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

beforeEach(() => {
  vi.clearAllMocks()
  mockLlmTextCompletion.mockReset()
  mockLlmTextToolCall.mockReset()
  mockIsContextLimitError.mockReset()
  mockIsContextLimitError.mockReturnValue(false)
})

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
    mockIsContextLimitError.mockReturnValue(true)
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
    mockIsContextLimitError.mockReturnValue(true)
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
    mockIsContextLimitError.mockReturnValue(true)
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
