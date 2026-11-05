import { describe, expect, it, vi } from 'vitest'

import { WorkerProviderError } from './provider-error'
import {
  isCleanSubmitRejection,
  SUBMIT_STEP_RETRIES,
  submitWithSafeRetry,
} from './submit-once'

function providerError(httpStatus?: number) {
  return new WorkerProviderError({
    message: `provider said ${httpStatus ?? 'nothing'}`,
    provider: 'fal',
    phase: 'queue_submit',
    httpStatus,
  })
}

/** 第 n 次调用抛 errors[n]，用完了就成功。 */
function submitThat(errors: unknown[]) {
  let calls = 0
  const submit = vi.fn(async () => {
    const error = errors[calls]
    calls += 1
    if (error !== undefined) throw error
    return 'job-1'
  })
  return submit
}

const noWait = vi.fn(async () => {})

describe('提交只发一次（防 step 超时 / 重试重复提交扣两次钱）', () => {
  it('引擎层的提交重试恒为 0', () => {
    expect(SUBMIT_STEP_RETRIES.limit).toBe(0)
  })

  it.each([408, 429, 503])(
    '服务商明确拒收（%s）：步骤里重发，直到成功',
    async (status) => {
      const submit = submitThat([providerError(status), providerError(status)])
      await expect(
        submitWithSafeRetry(submit, { attempts: 3, wait: noWait }),
      ).resolves.toBe('job-1')
      expect(submit).toHaveBeenCalledTimes(3)
    },
  )

  it.each([
    ['500', providerError(500)],
    ['502', providerError(502)],
    ['504', providerError(504)],
    ['400', providerError(400)],
    ['断线（fetch 抛 TypeError）', new TypeError('Network connection lost.')],
    ['步骤里的普通错误', new Error('socket hang up')],
    ['没有状态码的服务商错误', providerError()],
  ])('收没收下说不准（%s）：⛔ 不重发，原样抛出', async (_label, error) => {
    const submit = submitThat([error])
    await expect(
      submitWithSafeRetry(submit, { attempts: 3, wait: noWait }),
    ).rejects.toBe(error)
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('次数用完照原样抛最后一次的错误', async () => {
    const last = providerError(503)
    const submit = submitThat([providerError(503), last])
    await expect(
      submitWithSafeRetry(submit, { attempts: 2, wait: noWait }),
    ).rejects.toBe(last)
    expect(submit).toHaveBeenCalledTimes(2)
  })

  it('等待按 5s、10s 递增', async () => {
    const wait = vi.fn(async () => {})
    await submitWithSafeRetry(
      submitThat([providerError(503), providerError(503)]),
      { attempts: 3, wait },
    )
    expect(wait.mock.calls).toEqual([[5_000], [10_000]])
  })

  it('429 交给调用方排队时，步骤里不干等', async () => {
    const limited = providerError(429)
    const submit = submitThat([limited])
    await expect(
      submitWithSafeRetry(submit, {
        attempts: 2,
        rateLimitHandledByCaller: true,
        wait: noWait,
      }),
    ).rejects.toBe(limited)
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('isCleanSubmitRejection 只认 WorkerProviderError 上的 408/429/503', () => {
    expect(isCleanSubmitRejection(providerError(503))).toBe(true)
    expect(isCleanSubmitRejection(providerError(500))).toBe(false)
    expect(isCleanSubmitRejection(new Error('503'))).toBe(false)
  })
})
