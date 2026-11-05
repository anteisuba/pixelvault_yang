import { describe, expect, it } from 'vitest'

import {
  asWaitLimitIfAbortTimeout,
  buildWorkerFailureCallbackData,
  createAccountQueueTimeoutError,
  createGenerationWaitLimitError,
  createProviderResponseError,
  WORKER_GENERATION_ERROR_CODES,
} from './provider-error'

describe('worker 自己的等待上限', () => {
  it('轮询预算用完 → generation_wait_limit，且随失败回调带出 errorCode', () => {
    const error = createGenerationWaitLimitError({
      provider: 'fal',
      phase: 'image_poll',
      requestId: 'req-1',
    })
    expect(error.errorCode).toBe(
      WORKER_GENERATION_ERROR_CODES.GENERATION_WAIT_LIMIT,
    )
    const data = buildWorkerFailureCallbackData(error, { message: 'x' })
    expect(data.errorCode).toBe('generation_wait_limit')
    expect(data.error).toMatch(/Generation wait limit reached/)
  })

  it('按账号排队等满 → account_queue_timeout', () => {
    const error = createAccountQueueTimeoutError({
      provider: 'fal',
      phase: 'acquire_slot',
    })
    expect(error.errorCode).toBe(
      WORKER_GENERATION_ERROR_CODES.ACCOUNT_QUEUE_TIMEOUT,
    )
    expect(error.message).toMatch(/Account queue wait limit reached/)
  })

  it('AbortSignal.timeout 的 TimeoutError 转成 wait-limit，其它错误原样', () => {
    const abort = new DOMException('timed out', 'TimeoutError')
    const converted = asWaitLimitIfAbortTimeout(abort, {
      provider: 'gemini',
      phase: 'queue_submit',
    })
    expect(converted).toMatchObject({ errorCode: 'generation_wait_limit' })
    const other = new Error('boom')
    expect(
      asWaitLimitIfAbortTimeout(other, { provider: 'x', phase: 'y' }),
    ).toBe(other)
  })

  it('provider 回 504 / 408 才是 provider_timeout', async () => {
    for (const status of [408, 504]) {
      const error = await createProviderResponseError(
        new Response('upstream', { status }),
        { provider: 'p', phase: 'q', fallbackMessage: 'failed' },
      )
      expect(error.errorCode).toBe('provider_timeout')
    }
  })
})
