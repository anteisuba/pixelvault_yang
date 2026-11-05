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
import {
  downloadAndUploadAudioArtifact,
  downloadAndUploadVideoArtifact,
} from '../lib/media-io'
import {
  cancelArkTaskIfQueued,
  cancelFalQueueRequest,
  type ProviderCancelOutcome,
} from '../lib/provider-cancel'
import {
  createGenerationWaitLimitError,
  WorkerProviderError,
} from '../lib/provider-error'
import { pollFalQueue, submitFalQueue } from './fal/queue'
import { pollGeminiVideoQueue, submitGeminiVideoQueue } from './gemini/video'
import { pollMiniMaxQueue, submitMiniMaxQueue } from './minimax/video'
import { RETRY_TWICE } from './multi-step'
import type { MultiStepDriver } from './types'
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
  /** 等满预算时撤掉服务商的任务（best-effort）。没有取消接口的（MiniMax / Gemini）不写。 */
  cancel?(
    queue: FalQueueSubmitResult,
    apiKey: string,
  ): Promise<ProviderCancelOutcome>
}

const falQueueDriver: QueueDriver = {
  submit: submitFalQueue,
  poll: (queue, apiKey, context) =>
    pollFalQueue(queue, apiKey, context.outputType),
  cancel: (queue, apiKey) => cancelFalQueueRequest(queue.statusUrl, apiKey),
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
  // statusUrl 就是任务地址；只撤 queued 的（DELETE 对已结束任务是删记录）。
  cancel: (queue, apiKey) => cancelArkTaskIfQueued(queue.statusUrl, apiKey),
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

type CompletedQueueStatus = FalQueueStatusResult & { artifactUrl: string }

interface UploadedMedia {
  artifactUrl: string
  audioR2Key?: string
  videoR2Key?: string
}

/** 回调给应用的结果（`callback-result` 步骤发出去的那份）。 */
export interface QueueMediaResult {
  artifactUrl: string
  audioR2Key?: string
  videoR2Key?: string
  thumbnailUrl?: string
  providerMetadata?: Record<string, unknown>
  width?: number
  height?: number
  duration?: number
  requestCount: number
  seed?: number
  mimeType: string
}

/**
 * 视频（和 fal 音频）这一次运行的通用流程驱动。步骤名沿用拆之前的
 * `submit-provider` / `wait-provider-<n>` / `poll-provider-<n>` /
 * `download-and-upload-<video|audio>`，⛔ 不改（在飞实例按名字 replay）。
 * 按这次的服务商和产物类型现拼：Gemini 提交不重试、下载要带 key，视频 / 音频上传步骤名不同。
 */
export function buildQueueMediaDriver(
  context: WorkerRunContext,
): MultiStepDriver<
  WorkerRunContext,
  FalQueueSubmitResult,
  FalQueueStatusResult,
  CompletedQueueStatus,
  UploadedMedia,
  QueueMediaResult
> {
  const queueDriver = getQueueDriver(context.providerId)
  const isGemini = context.providerId === 'gemini'
  const cancelQueue = queueDriver.cancel
  return {
    stepNames: {
      submit: 'submit-provider',
      wait: (attempt) => `wait-provider-${attempt}`,
      poll: (attempt) => `poll-provider-${attempt}`,
      // 视频音频没有这两步；名字只为满足接口，流程不会走到。
      markRunning: 'mark-provider-running',
      cancelTimeout: 'cancel-provider-timeout',
      upload:
        context.outputType === 'AUDIO'
          ? 'download-and-upload-audio'
          : 'download-and-upload-video',
    },
    submitStep: {
      retries: {
        limit: isGemini ? 0 : 2,
        delay: '5 seconds',
        backoff: 'exponential',
      },
      timeout: Math.min(context.timeoutMs, 1_800_000),
    },
    pollStep: { retries: RETRY_TWICE, timeout: '30 seconds' },
    async submit({ env, readApiKey }) {
      return queueDriver.submit(context, await readApiKey(), env)
    },
    async poll({ readApiKey }, queue) {
      return queueDriver.poll(queue, await readApiKey(), context)
    },
    readPoll(polled) {
      if (polled.status === 'FAILED') {
        throw new WorkerProviderError({
          message: polled.error ?? 'Provider reported failed status.',
          provider: context.providerId,
          phase: 'provider_poll',
          errorCode: polled.errorCode,
          providerMetadata: polled.providerMetadata,
        })
      }
      if (polled.status === 'COMPLETED' && polled.artifactUrl) {
        return {
          state: 'done',
          value: { ...polled, artifactUrl: polled.artifactUrl },
        }
      }
      return { state: 'pending' }
    },
    cancelOnTimeout: cancelQueue
      ? async ({ readApiKey }, queue) => cancelQueue(queue, await readApiKey())
      : undefined,
    timeoutError: (queue) =>
      createGenerationWaitLimitError({
        provider: context.providerId,
        phase: 'provider_poll',
        requestId: queue.requestId,
      }),
    upload: {
      step: { retries: RETRY_TWICE, timeout: '120 seconds' },
      async run({ env, readApiKey }, _queue, done) {
        if (context.outputType === 'AUDIO') {
          return downloadAndUploadAudioArtifact(
            env,
            context,
            done.artifactUrl,
            done.mimeType ?? 'audio/wav',
          )
        }
        return downloadAndUploadVideoArtifact(
          env,
          context,
          done.artifactUrl,
          done.mimeType ?? 'video/mp4',
          isGemini ? { 'x-goog-api-key': await readApiKey() } : undefined,
        )
      },
    },
    toResult(_queue, done, uploaded) {
      const isVideo = context.outputType === 'VIDEO'
      return {
        artifactUrl: uploaded?.artifactUrl ?? done.artifactUrl,
        audioR2Key: uploaded?.audioR2Key,
        videoR2Key: uploaded?.videoR2Key,
        thumbnailUrl: done.thumbnailUrl,
        providerMetadata: done.providerMetadata,
        width: isVideo ? context.providerInput.width : undefined,
        height: isVideo ? context.providerInput.height : undefined,
        // The 'auto' literal can't satisfy ExecutionCallbackResultDataSchema's
        // numeric duration field — coerce to undefined and let DB store
        // null (the real output length comes from fal's response metadata
        // in future iterations).
        duration:
          isVideo &&
          !isGemini &&
          typeof context.providerInput.duration === 'number'
            ? context.providerInput.duration
            : undefined,
        requestCount: 1,
        seed: done.seed,
        mimeType: done.mimeType ?? (isVideo ? 'video/mp4' : 'audio/wav'),
      }
    },
  }
}
