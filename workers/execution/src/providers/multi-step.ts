import type { WorkflowStep } from 'cloudflare:workers'

import type { ExecutionProgressStage } from '../../../../src/constants/generation-progress'
import {
  settleProviderCancel,
  type ProviderCancelOutcome,
} from '../lib/provider-cancel'
import { WorkerProviderError } from '../lib/provider-error'
import { SUBMIT_STEP_RETRIES, submitWithSafeRetry } from '../lib/submit-once'
import type { DriverRuntime, MultiStepDriver, PollingContext } from './types'

/** 回报进度阶段只是通知，失败照旧吞掉；由 Workflow 传进来，免得这里反向依赖主文件。 */
export type ReportStage = (stage: ExecutionProgressStage) => Promise<void>

const MARK_RUNNING_STEP = {
  retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
  timeout: '30 seconds',
} as const

/** 取消只试一次：撤不掉就算了，⛔ 别让引擎重放（结果已折成数据，不会抛）。 */
const CANCEL_TIMEOUT_STEP = {
  retries: { limit: 0, delay: '1 second', backoff: 'constant' },
  timeout: '30 seconds',
} as const

/**
 * 先提交、再轮询的通用流程（出图 4 家 + 视频 / fal 音频）。原来各写一遍的循环收成这一份；
 * 步骤名、等待时长、每步的重试 / 超时都由驱动给，和搬之前一字不差。
 */
export async function runMultiStepDriver<
  TContext extends PollingContext,
  TJob,
  TPoll,
  TDone,
  TUploaded,
  TResult,
>(
  step: WorkflowStep,
  runtime: DriverRuntime<TContext>,
  driver: MultiStepDriver<TContext, TJob, TPoll, TDone, TUploaded, TResult>,
  reportStage: ReportStage,
): Promise<TResult> {
  const { context } = runtime
  const names = driver.stepNames

  // 提交只发一次：驱动写的重试次数挪进步骤里、只重试服务商明确拒收的；
  // 引擎层一律不重试（步骤超时 / 断线时重放 = 服务商那边多一单）。见 lib/submit-once.ts。
  const submitAttempts = (driver.submitStep.retries?.limit ?? 0) + 1
  const job = await step.do(
    names.submit,
    { ...driver.submitStep, retries: SUBMIT_STEP_RETRIES },
    () =>
      submitWithSafeRetry(() => driver.submit(runtime), {
        attempts: submitAttempts,
      }),
  )

  let done = driver.doneOnSubmit?.(job)
  let delayMs = context.pollIntervalMs
  let leftQueue = false
  for (
    let attempt = 1;
    done === undefined && attempt <= context.maxAttempts;
    attempt += 1
  ) {
    await step.sleep(names.wait(attempt), delayMs)
    const polled = await step.do(names.poll(attempt), driver.pollStep, () =>
      driver.poll(runtime, job),
    )
    const outcome = driver.readPoll(polled, job, context)
    if (outcome.state === 'done') {
      done = outcome.value
      break
    }
    delayMs = outcome.nextDelayMs ?? context.pollIntervalMs
    if (outcome.running) {
      // 首次离开队列才回报一次：之后每一轮都还是「在跑」，重复回报只会刷同一个阶段。
      const stage = driver.runningStage
      if (stage && !leftQueue) {
        await step.do(names.markRunning, MARK_RUNNING_STEP, () =>
          reportStage(stage),
        )
      }
      leftQueue = true
    }
  }

  if (done === undefined) {
    const cancel = driver.cancelOnTimeout
    let providerCancel: ProviderCancelOutcome | undefined
    if (cancel) {
      providerCancel = await step.do(
        names.cancelTimeout,
        CANCEL_TIMEOUT_STEP,
        () => settleProviderCancel(() => cancel(runtime, job)),
      )
    }
    const timeoutError = driver.timeoutError(job, context, {
      started: leftQueue,
    })
    // 撤没撤成记进失败详情：没撤成的，服务商可能还会出图 / 计费，靠 providerJobId 认领。
    if (providerCancel && timeoutError instanceof WorkerProviderError) {
      timeoutError.providerMetadata.providerCancel = providerCancel
    }
    throw timeoutError
  }

  const finished = done
  let uploaded: TUploaded | undefined
  if (driver.upload) {
    const upload = driver.upload
    uploaded = await step.do(names.upload, upload.step, () =>
      upload.run(runtime, job, finished),
    )
  }
  return driver.toResult(job, finished, uploaded, context)
}

export const RETRY_TWICE = {
  limit: 2,
  delay: '5 seconds',
  backoff: 'exponential',
} as const
