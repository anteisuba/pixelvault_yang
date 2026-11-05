import { afterEach, describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { llmTextCompletion } from '@/services/llm-text.service'
import { getLlmTextCompletionTimeoutMs } from '@/services/llm/llm-core'
import { runWithRequestDeadline } from '@/lib/request-deadline'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { LLM_TEXT_RETRY, LLM_TEXT_TIMEOUTS_MS } from '@/constants/config'

/**
 * 缓冲补全按这次请求剩下的时间等（owner 11-05：「AI 提供商超时」能避免的尽量避免）：
 * 30 秒的路由不再等满 120 秒被平台杀成 504，800 秒的路由也不再 120 秒就掐掉模型。
 */

afterEach(() => {
  vi.unstubAllGlobals()
})

const geminiInput = {
  systemPrompt: 'sys',
  userPrompt: 'user',
  adapterType: AI_ADAPTER_TYPES.GEMINI,
  providerConfig: {
    label: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
  },
  apiKey: 'test-key',
} as const

const { DEADLINE_MARGIN, MIN_ATTEMPT, COMPLETION } = LLM_TEXT_TIMEOUTS_MS

describe('LLM wait follows the route deadline', () => {
  it('outside a route keeps the fixed fallback', () => {
    expect(getLlmTextCompletionTimeoutMs()).toBe(COMPLETION)
  })

  it('a long route waits longer than the fallback, minus the margin', () => {
    runWithRequestDeadline(800, () => {
      const timeoutMs = getLlmTextCompletionTimeoutMs()
      expect(timeoutMs).toBeGreaterThan(COMPLETION)
      expect(timeoutMs).toBeLessThanOrEqual(800_000 - DEADLINE_MARGIN)
    })
  })

  it('a short route stops before the platform does', () => {
    runWithRequestDeadline(30, () => {
      expect(getLlmTextCompletionTimeoutMs()).toBeLessThanOrEqual(
        30_000 - DEADLINE_MARGIN,
      )
    })
  })

  it('does not send at all when the time left cannot fit an attempt', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const seconds = (DEADLINE_MARGIN + MIN_ATTEMPT / 2) / 1000

    await runWithRequestDeadline(seconds, () =>
      expect(llmTextCompletion(geminiInput)).rejects.toMatchObject({
        errorCode: 'PROVIDER_TIMEOUT',
        i18nKey: 'errors.provider.waitLimitReached',
      }),
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('skips the retry when a second attempt would not fit the time left', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('overloaded', { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)
    // 第一次够跑；失败后再等 TRANSIENT_DELAY_MS 就不够 MIN_ATTEMPT 了。
    const seconds =
      (DEADLINE_MARGIN + MIN_ATTEMPT + LLM_TEXT_RETRY.TRANSIENT_DELAY_MS / 2) /
      1000

    await runWithRequestDeadline(seconds, () =>
      expect(llmTextCompletion(geminiInput)).rejects.toMatchObject({
        errorCode: 'PROVIDER_TRANSIENT',
      }),
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
