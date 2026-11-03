import type { WorkflowStep } from 'cloudflare:workers'

import type { ExecutionProgressStage } from '../../../../src/constants/generation-progress'
import type { DriverRuntime, MultiStepDriver, PollingContext } from './types'

/** 回报进度阶段只是通知，失败照旧吞掉；由 Workflow 传进来，免得这里反向依赖主文件。 */
export type ReportStage = (stage: ExecutionProgressStage) => Promise<void>

const MARK_RUNNING_STEP = {
  retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
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
  const { context, env } = runtime
  const names = driver.stepNames

  const job = await step.do(names.submit, driver.submitStep, () =>
    driver.submit(runtime),
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
    if (outcome.running && driver.runningStage) {
      // 首次离开队列才回报一次：之后每一轮都还是「在跑」，重复回报只会刷同一个阶段。
      const stage = driver.runningStage
      if (!leftQueue) {
        await step.do(names.markRunning, MARK_RUNNING_STEP, () =>
          reportStage(stage),
        )
      }
      leftQueue = true
    }
  }

  if (done === undefined) {
    const cancel = driver.cancelOnTimeout
    if (cancel) {
      await step.do(
        names.cancelTimeout,
        { timeout: '30 seconds' },
        async () => {
          await cancel(env, job)
        },
      )
    }
    throw driver.timeoutError(job, context)
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
