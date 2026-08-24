import { describe, expect, it } from 'vitest'

import type {
  WorkflowStep,
  WorkflowStepConfig,
  WorkflowStepContext,
} from 'cloudflare:workers'

import {
  buildWorkerFailureCallbackData,
  WorkerProviderError,
  WorkerStepFailure,
} from './provider-error'
import {
  guardWorkflowStep,
  isNonRetryableProviderFailure,
} from './step-failure'

/**
 * 模拟 Cloudflare Workflows 的 step 边界，**包括它的有损行为**：
 *
 *   - 回调抛错 → 按 `retries.limit` 重试；
 *   - 重试用尽 → 把错误**拍平**成一个普通 `Error`，message 是原错误的
 *     `toString()`（`"<name>: <message>"`），原型和自有属性全丢。
 *
 * 拍平这一步就是这套测试要防的东西 —— 生产上 `errorCode` 就是这么没的。
 *
 * ⚠ 别把这里换成「原样重抛」来图省事：本地 `wrangler dev` 的 Workflows 模拟确实
 * 不丢属性，照着它写测试会以「错误的理由」变绿。
 */
function createFakeStep(): WorkflowStep & {
  attemptsByStep: Map<string, number>
  persisted: Map<string, unknown>
  sleeps: Array<{ name: string; duration: string | number }>
} {
  const attemptsByStep = new Map<string, number>()
  const persisted = new Map<string, unknown>()
  const sleeps: Array<{ name: string; duration: string | number }> = []

  const runStep = async <T>(
    name: string,
    config: WorkflowStepConfig | undefined,
    callback: (ctx: WorkflowStepContext) => Promise<T> | T,
  ): Promise<T> => {
    // 引擎会先把调用方的配置和默认值 merge 再传给回调。
    const mergedConfig: WorkflowStepConfig = {
      timeout: '10 minutes',
      ...config,
      retries: {
        limit: 5,
        delay: 10_000,
        backoff: 'exponential',
        ...config?.retries,
      },
    }
    const limit = mergedConfig.retries?.limit ?? 5

    for (let attempt = 1; ; attempt += 1) {
      attemptsByStep.set(name, attempt)
      try {
        const result = await callback({
          step: { name, count: 1 },
          attempt,
          config: mergedConfig,
        })
        persisted.set(name, result)
        return result
      } catch (error) {
        if (attempt <= limit) continue
        const flattened = new Error(String(error))
        throw flattened
      }
    }
  }

  return {
    attemptsByStep,
    persisted,
    sleeps,
    do: (<T>(
      name: string,
      configOrCallback: WorkflowStepConfig | ((ctx: WorkflowStepContext) => T),
      maybeCallback?: (ctx: WorkflowStepContext) => T,
    ) =>
      typeof configOrCallback === 'function'
        ? runStep(name, undefined, configOrCallback)
        : runStep(
            name,
            configOrCallback,
            maybeCallback as (ctx: WorkflowStepContext) => T,
          )) as WorkflowStep['do'],
    sleep: async (name: string, duration: string | number) => {
      sleeps.push({ name, duration })
    },
  }
}

const RATE_LIMITED = () =>
  new WorkerProviderError({
    message: 'slow down',
    provider: 'fal',
    phase: 'status_poll',
    errorCode: 'provider_rate_limit',
    httpStatus: 429,
    requestId: 'req-429',
  })

const BODY_TOO_LARGE = () =>
  new WorkerProviderError({
    message: 'bad request: body: exceeded max body size of 10MiB',
    provider: 'runner',
    phase: 'queue_submit',
    errorCode: 'unknown',
    httpStatus: 400,
    requestId: 'req-413',
  })

describe('guardWorkflowStep', () => {
  it('把最后一次尝试的 provider 失败带着 errorCode / providerMetadata 送出边界', async () => {
    const fake = createFakeStep()
    const step = guardWorkflowStep(fake)

    const error = await step
      .do('submit-provider', { retries: { limit: 1, delay: 1 } }, async () => {
        throw RATE_LIMITED()
      })
      .catch((e: unknown) => e)

    expect(error).toBeInstanceOf(WorkerStepFailure)
    const failure = (error as WorkerStepFailure).failure
    expect(failure.errorCode).toBe('provider_rate_limit')
    expect(failure.message).toBe('slow down')
    expect(failure.providerMetadata).toMatchObject({
      provider: 'fal',
      phase: 'status_poll',
      httpStatus: 429,
      requestId: 'req-429',
    })
  })

  it('可重试的失败照常用满重试次数，重试语义不变', async () => {
    const fake = createFakeStep()
    const step = guardWorkflowStep(fake)

    await step
      .do('submit-provider', { retries: { limit: 2, delay: 1 } }, async () => {
        throw RATE_LIMITED()
      })
      .catch(() => undefined)

    // limit 2 = 首次 + 2 次重试 = 3 次尝试，第 3 次才转成结构化失败。
    expect(fake.attemptsByStep.get('submit-provider')).toBe(3)
  })

  it('4xx 这类重放不可能成功的失败当场结束，不白等重试', async () => {
    const fake = createFakeStep()
    const step = guardWorkflowStep(fake)

    const error = await step
      .do(
        'submit-runner-job',
        { retries: { limit: 2, delay: 1 } },
        async () => {
          throw BODY_TOO_LARGE()
        },
      )
      .catch((e: unknown) => e)

    expect(fake.attemptsByStep.get('submit-runner-job')).toBe(1)
    expect(error).toBeInstanceOf(WorkerStepFailure)
    expect((error as WorkerStepFailure).failure.message).toBe(
      'bad request: body: exceeded max body size of 10MiB',
    )
  })

  it('成功路径的返回值原样透传，持久化进 workflow state 的形状不变', async () => {
    const fake = createFakeStep()
    const step = guardWorkflowStep(fake)

    const result = await step.do('submit-provider', async () => ({
      requestId: 'abc',
      statusUrl: 'https://example.test/status',
    }))

    expect(result).toEqual({
      requestId: 'abc',
      statusUrl: 'https://example.test/status',
    })
    // 关键：state 里存的就是原始返回值，没有多套一层信封。
    expect(fake.persisted.get('submit-provider')).toEqual(result)
  })

  it('不是 provider 失败的错误不拦，交给引擎按原样处理', async () => {
    const fake = createFakeStep()
    const step = guardWorkflowStep(fake)

    const error = await step
      .do('callback-result', { retries: { limit: 0, delay: 1 } }, async () => {
        throw new Error('callback endpoint returned 500')
      })
      .catch((e: unknown) => e)

    expect(error).not.toBeInstanceOf(WorkerStepFailure)
    expect(String((error as Error).message)).toContain(
      'callback endpoint returned 500',
    )
  })

  it('sleep 原样转发给引擎', async () => {
    const fake = createFakeStep()
    const step = guardWorkflowStep(fake)

    await step.sleep('wait-provider-1', 5_000)

    expect(fake.sleeps).toEqual([{ name: 'wait-provider-1', duration: 5_000 }])
  })
})

describe('isNonRetryableProviderFailure', () => {
  it('4xx 里只放过 408 / 429', () => {
    const build = (httpStatus: number) =>
      new WorkerProviderError({
        message: 'x',
        provider: 'fal',
        phase: 'queue_submit',
        httpStatus,
      })

    expect(isNonRetryableProviderFailure(build(400))).toBe(true)
    expect(isNonRetryableProviderFailure(build(413))).toBe(true)
    expect(isNonRetryableProviderFailure(build(408))).toBe(false)
    expect(isNonRetryableProviderFailure(build(429))).toBe(false)
    expect(isNonRetryableProviderFailure(build(503))).toBe(false)
  })

  it('按 errorCode 认那些重试也不会变的失败', () => {
    const build = (errorCode: string) =>
      new WorkerProviderError({
        message: 'x',
        provider: 'runner',
        phase: 'status_poll',
        errorCode,
      })

    expect(isNonRetryableProviderFailure(build('content_filtered'))).toBe(true)
    expect(isNonRetryableProviderFailure(build('runner_queue_stuck'))).toBe(
      true,
    )
    expect(isNonRetryableProviderFailure(build('provider_overloaded'))).toBe(
      false,
    )
    expect(isNonRetryableProviderFailure(build('unknown'))).toBe(false)
  })
})

describe('buildWorkerFailureCallbackData', () => {
  it('从 WorkerStepFailure 里取出 errorCode，并把 fallback 元数据合进去', () => {
    const data = buildWorkerFailureCallbackData(
      new WorkerStepFailure({
        message: 'slow down',
        errorCode: 'provider_rate_limit',
        providerMetadata: { provider: 'fal', phase: 'status_poll' },
      }),
      {
        message: 'Workflow execution failed.',
        providerMetadata: { workflowInstanceId: 'wf-1' },
      },
    )

    expect(data).toEqual({
      error: 'slow down',
      errorCode: 'provider_rate_limit',
      providerMetadata: {
        workflowInstanceId: 'wf-1',
        provider: 'fal',
        phase: 'status_poll',
      },
    })
  })

  it('回归锁：被 step 边界拍平的错误拿不到 errorCode —— 所以 provider 失败必须走 guard', () => {
    const flattened = new Error(String(RATE_LIMITED()))

    const data = buildWorkerFailureCallbackData(flattened, {
      message: 'Workflow execution failed.',
      providerMetadata: { workflowInstanceId: 'wf-1' },
    })

    expect(data.errorCode).toBeUndefined()
    expect(data.error).toBe('WorkerProviderError: slow down')
    expect(data.providerMetadata).toEqual({ workflowInstanceId: 'wf-1' })
  })
})
