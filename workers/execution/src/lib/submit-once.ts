import { WorkerProviderError } from './provider-error'

/**
 * ─── 提交步骤：引擎不重试，只在步骤里重试「确定没收下」的 ──────────────────────
 *
 * Workflow 的 `step.do` 失败或**超时**后，引擎会把整段回调从头再跑一遍。提交类步骤
 * （向服务商发「开始生成」）要是这么重跑：第一次其实已经被收下、只是响应没回来 / 我们的
 * 步骤超时了，第二次就是又一单 —— 服务商那边跑两份、扣两次钱，第一份结果还没人要。
 * fal / Replicate / 火山 / Rodin / Fish 都没有可用的幂等键，只能从我们这边保证「只发一次」。
 *
 * 做法：
 * 1. 提交步骤的引擎重试一律 `limit: 0`（`SUBMIT_STEP_RETRIES`）—— 步骤超时、网络断、5xx
 *    这些「不知道对方收没收」的情况直接判失败，⛔ 不重发。
 * 2. 步骤里用 `submitWithSafeRetry` 补回原来的重试次数，但只重试服务商**明确拒收**的：
 *    408（请求没收完）/ 429（限流）/ 503（暂不可用）。这三种对方都没有立案，重发不会多一单。
 *
 * ⚠ 代价：提交时偶发的 500 / 502 / 504 / 断线不再自动重试，用户会看到一次失败。这是有意的
 * 取舍 —— 一次可重试的失败，好过一次静默的双倍扣费。
 */
export const SUBMIT_STEP_RETRIES = {
  limit: 0,
  delay: '1 second',
  backoff: 'constant',
} as const

const CLEAN_REJECTION_STATUSES = new Set([408, 429, 503])

/** 服务商明确拒收（没立案）的提交失败：重发不会多出一单。 */
export function isCleanSubmitRejection(error: unknown): boolean {
  if (!(error instanceof WorkerProviderError)) return false
  const httpStatus = error.providerMetadata.httpStatus
  return (
    typeof httpStatus === 'number' && CLEAN_REJECTION_STATUSES.has(httpStatus)
  )
}

function isRateLimitRejection(error: unknown): boolean {
  return (
    error instanceof WorkerProviderError &&
    error.providerMetadata.httpStatus === 429
  )
}

/** 第 n 次重试前等多久：5 秒、10 秒、20 秒……和原来引擎的 exponential 一致。 */
export const SUBMIT_RETRY_BASE_DELAY_MS = 5_000

export interface SubmitRetryOptions {
  /** 总共最多发几次（含第一次）。 */
  attempts: number
  /**
   * 429 交给调用方：出图 Workflow 有自己的限流排队（`rate-limited-wait-<n>`，用 step.sleep
   * 持久地等），步骤里别再干等一遍。
   */
  rateLimitHandledByCaller?: boolean
  /** 测试注入；默认真等。 */
  wait?: (ms: number) => Promise<void>
}

function defaultWait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 步骤内的提交重试：见文件头。额外的等待时间要算进步骤的 timeout。 */
export async function submitWithSafeRetry<T>(
  submit: () => Promise<T>,
  options: SubmitRetryOptions,
): Promise<T> {
  const wait = options.wait ?? defaultWait
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await submit()
    } catch (error) {
      if (
        attempt >= options.attempts ||
        !isCleanSubmitRejection(error) ||
        (options.rateLimitHandledByCaller && isRateLimitRejection(error))
      ) {
        throw error
      }
      await wait(SUBMIT_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1))
    }
  }
}
