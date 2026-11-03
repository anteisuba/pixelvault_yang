import type {
  ExecutionEnv,
  FalQueueStatusResult,
  FalQueueSubmitResult,
  WorkerRunContext,
} from '../../index'
import { reportProviderJobId } from '../../lib/app-bridge'
import { isRecord, readNumberField, readStringField } from '../../lib/fields'
import { JSON_CONTENT_TYPE } from '../../lib/http'
import {
  createProviderNoOutputError,
  createProviderPayloadError,
  createProviderResponseError,
} from '../../lib/provider-error'
import {
  buildVolcEngineVideoRequest,
  mapVolcEngineStatus,
  VOLCENGINE_DEFAULT_BASE_URL,
} from './video-request-builder'

// ─── VolcEngine (火山方舟) Seedance video ─────────────────────────
// Direct Ark API. The reason this exists: fal resells the same Seedance models
// at ~2.2× the Ark price, and until this branch landed the Ark route was
// catalog-only (the service 501'd on anything that wasn't fal).

export async function submitVolcEngineQueue(
  context: WorkerRunContext,
  apiKey: string,
  env: ExecutionEnv,
): Promise<FalQueueSubmitResult> {
  if (context.outputType !== 'VIDEO') {
    throw new Error('VolcEngine video branch handles VIDEO output only.')
  }

  const baseUrl = (
    context.providerInput.providerBaseUrl ?? VOLCENGINE_DEFAULT_BASE_URL
  ).replace(/\/$/, '')
  const endpoint = `${baseUrl}/contents/generations/tasks`
  const body = buildVolcEngineVideoRequest({
    prompt: context.providerInput.prompt,
    modelId: context.providerInput.modelId,
    externalModelId: context.providerInput.externalModelId,
    aspectRatio: context.providerInput.aspectRatio,
    duration: context.providerInput.duration,
    referenceImage: context.providerInput.referenceImage,
    referenceImages: context.providerInput.referenceImages,
    videoUrls: context.providerInput.videoUrls,
    audioUrls: context.providerInput.audioUrls,
    resolution: context.providerInput.resolution,
    videoDefaults: context.providerInput.videoDefaults,
    generateAudio: context.providerInput.generateAudio,
    seed: context.providerInput.seed,
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
      fallbackMessage: `VolcEngine submit failed with status ${response.status}`,
    })
  }

  const data = (await response.json()) as Record<string, unknown>
  const submitFailure = createProviderPayloadError(data, {
    provider: context.providerId,
    phase: 'queue_submit',
    fallbackMessage: 'VolcEngine submit reported failure.',
  })
  if (submitFailure) throw submitFailure

  const taskId = readStringField(data, 'id')
  if (!taskId) {
    throw new Error('VolcEngine submit returned no task id.')
  }

  await reportProviderJobId(env, context, taskId)

  // Ark serves status and result from one endpoint, so both URLs are the same.
  const taskUrl = `${baseUrl}/contents/generations/tasks/${taskId}`
  return { requestId: taskId, statusUrl: taskUrl, responseUrl: taskUrl }
}

export async function pollVolcEngineQueue(
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
      fallbackMessage: `VolcEngine status poll failed with status ${response.status}`,
      requestId: queue.requestId,
    })
  }

  const data = (await response.json()) as Record<string, unknown>
  const rawStatus = readStringField(data, 'status') ?? ''
  const status = mapVolcEngineStatus(rawStatus)
  const providerMetadata = {
    requestId: queue.requestId,
    statusUrl: queue.statusUrl,
    providerStatus: rawStatus,
  }

  if (status === 'FAILED') {
    const error = isRecord(data.error) ? data.error : null
    return {
      status: 'FAILED',
      error:
        (error ? readStringField(error, 'message') : null) ??
        `VolcEngine task ${rawStatus}.`,
      errorCode: error
        ? (readStringField(error, 'code') ?? undefined)
        : undefined,
      providerMetadata,
    }
  }

  if (status !== 'COMPLETED') {
    return { status, providerMetadata }
  }

  const content = isRecord(data.content) ? data.content : null
  const artifactUrl = content ? readStringField(content, 'video_url') : null
  if (!artifactUrl) {
    throw createProviderNoOutputError({
      provider: providerId,
      phase: 'result_fetch',
      message: 'VolcEngine task succeeded but returned no video URL.',
      requestId: queue.requestId,
      providerMetadata,
    })
  }

  // `return_last_frame: true` in the request body is what makes this available;
  // it doubles as the poster frame downstream.
  const thumbnailUrl = content
    ? (readStringField(content, 'last_frame_url') ?? undefined)
    : undefined

  // 官方任务返回带实际种子（没传种子时是服务端随机挑的），带回去记进配方。
  const seed = readNumberField(data, 'seed')
  return {
    status: 'COMPLETED',
    artifactUrl,
    thumbnailUrl,
    ...(seed != null && seed >= 0 ? { seed } : {}),
    providerMetadata,
  }
}
