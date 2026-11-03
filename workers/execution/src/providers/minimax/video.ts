import type {
  ExecutionEnv,
  FalQueueStatusResult,
  FalQueueSubmitResult,
  WorkerRunContext,
} from '../../index'
import { reportProviderJobId } from '../../lib/app-bridge'
import { isRecord, readStringField } from '../../lib/fields'
import { JSON_CONTENT_TYPE } from '../../lib/http'
import {
  createProviderNoOutputError,
  createProviderPayloadError,
  createProviderResponseError,
  WORKER_GENERATION_ERROR_CODES,
} from '../../lib/provider-error'
import {
  buildMiniMaxVideoRequest,
  mapMiniMaxStatus,
  miniMaxBaseUrl,
} from './video-request-builder'

// ─── MiniMax (H3) video — native direct, both stations ───────────
// The second video provider on this workflow. fal stays the default; anything
// routed here goes to MiniMax's own async face instead of queue.fal.run.

const MINIMAX_CONTENT_FILTER_CODES = new Set(['1026', '1027'])

export async function submitMiniMaxQueue(
  context: WorkerRunContext,
  apiKey: string,
  env: ExecutionEnv,
): Promise<FalQueueSubmitResult> {
  if (context.outputType !== 'VIDEO') {
    throw new Error('MiniMax adapter handles VIDEO output only.')
  }

  const baseUrl = miniMaxBaseUrl(context.providerId)
  const endpoint = `${baseUrl}/video_generation`
  const body = buildMiniMaxVideoRequest({
    prompt: context.providerInput.prompt,
    modelId: context.providerInput.modelId,
    externalModelId: context.providerInput.externalModelId,
    aspectRatio: context.providerInput.aspectRatio,
    duration: context.providerInput.duration,
    referenceImage: context.providerInput.referenceImage,
    referenceImages: context.providerInput.referenceImages,
    videoUrls: context.providerInput.videoUrls,
    audioUrls: context.providerInput.audioUrls,
  })

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': JSON_CONTENT_TYPE,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw await createProviderResponseError(response, {
      provider: context.providerId,
      phase: 'queue_submit',
      fallbackMessage: `MiniMax submit failed with status ${response.status}`,
    })
  }

  const data = (await response.json()) as Record<string, unknown>
  const submitFailure = createProviderPayloadError(data, {
    provider: context.providerId,
    phase: 'queue_submit',
    fallbackMessage: 'MiniMax submit reported failure.',
  })
  if (submitFailure) throw submitFailure

  const taskId = readStringField(data, 'task_id')
  if (!taskId) {
    throw new Error('MiniMax submit returned no task_id.')
  }

  await reportProviderJobId(env, context, taskId)

  // MiniMax has a single query endpoint — status and result come back
  // together, so statusUrl and responseUrl are deliberately the same URL.
  const queryUrl = `${baseUrl}/query/video_generation/${taskId}`
  return { requestId: taskId, statusUrl: queryUrl, responseUrl: queryUrl }
}

export async function pollMiniMaxQueue(
  queue: FalQueueSubmitResult,
  apiKey: string,
  providerId: string,
): Promise<FalQueueStatusResult> {
  const response = await fetch(queue.statusUrl, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })

  if (!response.ok) {
    throw await createProviderResponseError(response, {
      provider: providerId,
      phase: 'status_poll',
      fallbackMessage: `MiniMax status poll failed with status ${response.status}`,
      requestId: queue.requestId,
    })
  }

  const data = (await response.json()) as Record<string, unknown>
  const task = isRecord(data.task) ? data.task : null
  if (!task) {
    throw new Error('MiniMax status response did not include a task object.')
  }

  const rawStatus = readStringField(task, 'status') ?? ''
  const status = mapMiniMaxStatus(rawStatus)
  const providerMetadata = {
    requestId: queue.requestId,
    statusUrl: queue.statusUrl,
    providerStatus: rawStatus,
  }

  if (status === 'FAILED') {
    // v2 的 error 是对象 { code, message }（官方示例：1026 内容不合规）。
    const error = isRecord(task.error) ? task.error : null
    return {
      status: 'FAILED',
      error:
        (error ? readStringField(error, 'message') : null) ??
        readStringField(task, 'error') ??
        `MiniMax task ${rawStatus}.`,
      // 1026 = 输入不合规、1027 = 生成的视频不合规（官方错误码表）。
      errorCode: MINIMAX_CONTENT_FILTER_CODES.has(
        (error ? readStringField(error, 'code') : null) ?? '',
      )
        ? WORKER_GENERATION_ERROR_CODES.CONTENT_FILTERED
        : undefined,
      providerMetadata: {
        ...providerMetadata,
        ...(error ? { providerErrorCode: readStringField(error, 'code') } : {}),
      },
    }
  }

  if (status !== 'COMPLETED') {
    return { status, providerMetadata }
  }

  const content = isRecord(task.content) ? task.content : null
  const artifactUrl = content ? readStringField(content, 'url') : null
  if (!artifactUrl) {
    throw createProviderNoOutputError({
      provider: providerId,
      phase: 'result_fetch',
      message: 'MiniMax task succeeded but returned no video URL.',
      requestId: queue.requestId,
      providerMetadata,
    })
  }

  return { status: 'COMPLETED', artifactUrl, providerMetadata }
}
