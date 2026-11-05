import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { completion } = vi.hoisted(() => ({
  completion: vi.fn(),
}))

vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: completion,
  isLlmTextContextLimitError: (error: unknown) =>
    error instanceof Error && error.message === 'context overflow',
}))

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  expectSelectedProviderOnly,
  providerUsesOf,
} from '@/test/selected-provider-only'
import { completeAssistantTextWithContextRetry } from './assistant-completion.service'

const workerFetch =
  vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()

const options = {
  systemPrompt: 'system',
  route: {
    adapterType: AI_ADAPTER_TYPES.OPENAI,
    providerConfig: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
    apiKey: 'test-key',
  },
  contextCompactionTargetLength: 20,
}

describe('assistant completion cancellation and context retry', () => {
  beforeEach(() => {
    completion.mockReset()
  })

  it('does not dispatch a pre-cancelled request', async () => {
    const controller = new AbortController()
    const reason = new DOMException('stopped', 'AbortError')
    controller.abort(reason)
    const buildUserPrompt = vi.fn(() => 'full')
    await expect(
      completeAssistantTextWithContextRetry({
        ...options,
        signal: controller.signal,
        buildUserPrompt,
      }),
    ).rejects.toBe(reason)
    expect(buildUserPrompt).not.toHaveBeenCalled()
    expect(completion).not.toHaveBeenCalled()
  })

  it('forwards cancellation to both context attempts', async () => {
    const signal = new AbortController().signal
    const buildUserPrompt = vi.fn((limit?: number) =>
      limit ? 'compact' : 'full',
    )
    completion.mockRejectedValueOnce(new Error('context overflow'))
    completion.mockResolvedValueOnce('answer')
    await expect(
      completeAssistantTextWithContextRetry({
        ...options,
        signal,
        buildUserPrompt,
      }),
    ).resolves.toBe('answer')
    expect(completion).toHaveBeenCalledTimes(2)
    expect(completion).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ signal, userPrompt: 'full' }),
    )
    expect(completion).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ signal, userPrompt: 'compact' }),
    )
    expect(buildUserPrompt).toHaveBeenLastCalledWith(20)
  })

  it('does not compact or retry after cancellation even if the provider reports overflow', async () => {
    const controller = new AbortController()
    const reason = new DOMException('stopped', 'AbortError')
    const buildUserPrompt = vi.fn(() => 'full')
    completion.mockImplementationOnce(async () => {
      controller.abort(reason)
      throw new Error('context overflow')
    })
    await expect(
      completeAssistantTextWithContextRetry({
        ...options,
        signal: controller.signal,
        buildUserPrompt,
      }),
    ).rejects.toBe(reason)
    expect(buildUserPrompt).toHaveBeenCalledTimes(1)
    expect(completion).toHaveBeenCalledTimes(1)
  })

  // 临时不可用的重发在入口 llm-text.service 统一做（docs/design/llm.md §4），
  // 这里再叠一层就成了 2×2 次。
  it('does not stack its own retry on a provider outage', async () => {
    const failure = new Error('overloaded')
    completion.mockRejectedValue(failure)
    await expect(
      completeAssistantTextWithContextRetry({
        ...options,
        buildUserPrompt: () => 'full',
      }),
    ).rejects.toBe(failure)
    expect(completion).toHaveBeenCalledTimes(1)
  })

  /**
   * ⛔ 出不来就不换一家（owner 2026-10-15：「会自动扣其他模型的token，用户还不知道」）。
   * 只在同一家、同一把 key、同一个型号上重发一次，仍不行就把原错交回。
   */
  it('只用所选那一家：timed out → no retry on any other provider, the original error', async () => {
    const failure = new Error('timed out')
    completion.mockRejectedValue(failure)
    await expect(
      completeAssistantTextWithContextRetry({
        ...options,
        buildUserPrompt: () => 'full',
      }),
    ).rejects.toBe(failure)
    expect(completion).toHaveBeenCalledTimes(1)
    expectSelectedProviderOnly(providerUsesOf(completion, 'step'), {
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      apiKey: 'test-key',
    })
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
    // 调用日志转给 execution worker：只假网络那一跳（签名、拼地址都是真代码）。
    vi.stubEnv('EXECUTION_WORKER_BASE_URL', 'https://worker.test')
    vi.stubEnv('INTERNAL_CALLBACK_SECRET', 'test-callback-secret')
    workerFetch.mockReset()
    workerFetch.mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', workerFetch)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
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

  it('重发的两次各一行；没报 token 的那次标 usageReported:false', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      completion.mockRejectedValueOnce(new Error('context overflow'))
      completion.mockImplementationOnce(
        async (input: { onUsage?: (usage: object) => void }) => {
          input.onUsage?.({ inputTokens: 9000, reasoningTokens: 800 })
          return 'answer'
        },
      )
      await completeAssistantTextWithContextRetry({
        ...options,
        buildUserPrompt: (limit?: number) => (limit ? 'compact' : 'full'),
        callLog: { purpose: 'step', domain: 'canvas', step: 3 },
      })
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

  it('被掐断（⏹ / 时间预算）记成 aborted', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const controller = new AbortController()
      const reason = new DOMException('stopped', 'AbortError')
      completion.mockImplementationOnce(async () => {
        controller.abort(reason)
        throw reason
      })
      await expect(
        completeAssistantTextWithContextRetry({
          ...options,
          signal: controller.signal,
          buildUserPrompt: () => 'full',
          callLog: { purpose: 'step' },
        }),
      ).rejects.toBe(reason)
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
      workerFetch.mockResolvedValueOnce(new Response(null, { status: 503 }))
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
      expect(workerFetch).toHaveBeenCalledTimes(1)
      const [url, init] = workerFetch.mock.calls[0]!
      expect(String(url)).toMatch(/^https:\/\/worker\.test\//)
      expect(JSON.parse(String(init?.body))).toEqual(
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
