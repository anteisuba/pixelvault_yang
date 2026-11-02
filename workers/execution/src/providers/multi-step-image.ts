import type { WorkflowStep } from 'cloudflare:workers'

import type { ExecutionProgressStage } from '../../../../src/constants/generation-progress'
import type { WorkerImageGenerationResult } from '../index'
import type {
  ImageDriverRuntime,
  MultiStepImageDriver,
  UploadedImage,
} from './types'

/** 回报进度阶段只是通知，失败照旧吞掉；由 Workflow 传进来，免得这里反向依赖主文件。 */
export type ReportImageStage = (stage: ExecutionProgressStage) => Promise<void>

const MARK_RUNNING_STEP = {
  retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' },
  timeout: '30 seconds',
} as const

/**
 * 先提交、再轮询的通用出图流程。逐家原来各写一遍的循环收成这一份；
 * 步骤名、等待时长、每步的重试 / 超时都由驱动给，和搬之前一字不差。
 */
export async function runMultiStepImageDriver<TJob, TPoll, TDone>(
  step: WorkflowStep,
  runtime: ImageDriverRuntime,
  driver: MultiStepImageDriver<TJob, TPoll, TDone>,
  reportStage: ReportImageStage,
): Promise<WorkerImageGenerationResult> {
  const { context, env } = runtime
  const key = driver.stepKey

  const job = await step.do(`submit-${key}-image`, driver.submitStep, () =>
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
    await step.sleep(`wait-${key}-image-${attempt}`, delayMs)
    const polled = await step.do(
      `poll-${key}-image-${attempt}`,
      driver.pollStep,
      () => driver.poll(runtime, job),
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
        await step.do(`mark-${key}-image-running`, MARK_RUNNING_STEP, () =>
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
        `cancel-${key}-image-timeout`,
        { timeout: '30 seconds' },
        async () => {
          await cancel(env, job)
        },
      )
    }
    throw driver.timeoutError(job, context)
  }

  const finished = done
  let uploaded: UploadedImage | undefined
  if (driver.upload) {
    const upload = driver.upload
    uploaded = await step.do(`upload-${key}-image`, upload.step, () =>
      upload.run(runtime, job, finished),
    )
  }
  return driver.toResult(job, finished, uploaded, context)
}
