import {
  isWorkerVideoProviderId,
  type WorkerVideoProviderId,
} from '../../../../src/constants/worker-video-providers'
import type {
  ExecutionEnv,
  FalQueueStatusResult,
  FalQueueSubmitResult,
  WorkerRunContext,
} from '../index'
import { pollFalQueue, submitFalQueue } from './fal/queue'
import { pollGeminiVideoQueue, submitGeminiVideoQueue } from './gemini/video'
import { pollMiniMaxQueue, submitMiniMaxQueue } from './minimax/video'
import { pollVolcEngineQueue, submitVolcEngineQueue } from './volcengine/video'

/**
 * 视频（和 fal 的音频）「提交 → 轮询」驱动（o-worker 第 5 步）。
 * `CinematicShortVideoWorkflow` 的 `submit-provider` / `poll-provider-<n>` 步骤按服务商
 * 来这里取驱动；步骤名和流程不变，只是原来那串 if 换成了表。
 */
export interface QueueDriver {
  submit(
    context: WorkerRunContext,
    apiKey: string,
    env: ExecutionEnv,
  ): Promise<FalQueueSubmitResult>
  poll(
    queue: FalQueueSubmitResult,
    apiKey: string,
    context: WorkerRunContext,
  ): Promise<FalQueueStatusResult>
}

const falQueueDriver: QueueDriver = {
  submit: submitFalQueue,
  poll: (queue, apiKey, context) =>
    pollFalQueue(queue, apiKey, context.outputType),
}

const miniMaxQueueDriver: QueueDriver = {
  submit: submitMiniMaxQueue,
  poll: (queue, apiKey, context) =>
    pollMiniMaxQueue(queue, apiKey, context.providerId),
}

const volcEngineQueueDriver: QueueDriver = {
  submit: submitVolcEngineQueue,
  poll: (queue, apiKey, context) =>
    pollVolcEngineQueue(queue, apiKey, context.providerId),
}

/** 按共享契约 `worker-video-providers.ts` 穷举：契约里多一家、这里没写，类型检查报错。 */
const VIDEO_QUEUE_DRIVERS: Record<WorkerVideoProviderId, QueueDriver> = {
  gemini: {
    submit: submitGeminiVideoQueue,
    poll: (queue, apiKey) => pollGeminiVideoQueue(queue, apiKey),
  },
  fal: falQueueDriver,
  minimax: miniMaxQueueDriver,
  minimax_cn: miniMaxQueueDriver,
  volcengine: volcEngineQueueDriver,
  byteplus: volcEngineQueueDriver,
}

/**
 * 名单外的一律走 fal（音频的 fal 队列就是这条；和拆之前的兜底一致）。
 */
export function getQueueDriver(providerId: string): QueueDriver {
  return isWorkerVideoProviderId(providerId)
    ? VIDEO_QUEUE_DRIVERS[providerId]
    : falQueueDriver
}
