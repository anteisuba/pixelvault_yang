import type {
  ExecutionEnv,
  FalQueueStatusResult,
  FalQueueSubmitResult,
  WorkerAudioRunContext,
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
import { buildFalWorkerQueueRequest as buildFalWorkerVideoQueueRequest } from './video-request-builders'

export function isFalQueueFailureStatus(status: string): boolean {
  const normalized = status.toUpperCase()
  return (
    normalized === 'FAILED' ||
    normalized === 'ERROR' ||
    normalized === 'CANCELED' ||
    normalized === 'CANCELLED'
  )
}

export function buildFalWorkerAudioQueueRequest(
  context: WorkerAudioRunContext,
): {
  endpointModelId: string
  input: Record<string, unknown>
  isDocumentationVerified: boolean
} {
  if (!context.providerInput.referenceAudioUrl) {
    throw new Error('fal.ai F5-TTS requires referenceAudioUrl.')
  }

  const body: Record<string, unknown> = {
    gen_text: context.providerInput.prompt,
    ref_audio_url: context.providerInput.referenceAudioUrl,
    model_type: 'F5-TTS',
    remove_silence: true,
  }

  if (context.providerInput.referenceText) {
    body.ref_text = context.providerInput.referenceText
  }

  return {
    endpointModelId: context.providerInput.externalModelId,
    input: body,
    isDocumentationVerified: true,
  }
}

export function buildFalWorkerQueueRequest(context: WorkerRunContext): {
  endpointModelId: string
  input: Record<string, unknown>
  isDocumentationVerified: boolean
} {
  if (context.outputType === 'AUDIO') {
    return buildFalWorkerAudioQueueRequest(context)
  }

  return buildFalWorkerVideoQueueRequest(context)
}

export async function submitFalQueue(
  context: WorkerRunContext,
  apiKey: string,
  env: ExecutionEnv,
): Promise<FalQueueSubmitResult> {
  const queueBody = buildFalWorkerQueueRequest(context)
  const baseUrl = 'https://queue.fal.run'
  const endpoint = `${baseUrl}/${queueBody.endpointModelId}`

  if (!queueBody.isDocumentationVerified) {
    // TODO(video-payload-audit): replace this warning after the provider
    // publishes a current schema page for this endpoint.
    console.warn('fal.ai worker request body uses unverified schema', {
      modelId: context.providerInput.modelId,
      endpoint,
      body: queueBody.input,
    })
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': JSON_CONTENT_TYPE,
    },
    body: JSON.stringify(queueBody.input),
  })

  if (!response.ok) {
    throw await createProviderResponseError(response, {
      provider: 'fal',
      phase: 'queue_submit',
      fallbackMessage: `fal.ai queue submit failed with status ${response.status}`,
    })
  }

  const data = (await response.json()) as Record<string, unknown>
  const submitFailure = createProviderPayloadError(data, {
    provider: 'fal',
    phase: 'queue_submit',
    fallbackMessage: 'fal.ai queue submit reported failure.',
  })
  if (submitFailure) throw submitFailure

  const requestId = readStringField(data, 'request_id')
  const statusUrl = readStringField(data, 'status_url')
  const responseUrl = readStringField(data, 'response_url')

  if (!requestId || !statusUrl || !responseUrl) {
    throw new Error('fal.ai queue submit returned an invalid response.')
  }

  // fal's cancel endpoint is per-model (PUT
  // https://queue.fal.run/{model_id}/requests/{request_id}/cancel), so the
  // bare request_id alone can't address it — report the full path segment
  // that cancelProviderJob already expects in `providerJobId`.
  const providerJobId = `${queueBody.endpointModelId}/requests/${requestId}`
  await reportProviderJobId(env, context, providerJobId)

  return { requestId, statusUrl, responseUrl }
}

export function readFalAudioArtifact(resultData: Record<string, unknown>): {
  artifactUrl: string | null
  mimeType?: string
} {
  const audioUrl = isRecord(resultData.audio_url) ? resultData.audio_url : null
  const audio = isRecord(resultData.audio) ? resultData.audio : null
  const audioRecord = audioUrl ?? audio

  if (!audioRecord) return { artifactUrl: null }

  return {
    artifactUrl: readStringField(audioRecord, 'url'),
    mimeType: readStringField(audioRecord, 'content_type') ?? undefined,
  }
}

export async function pollFalQueue(
  queue: FalQueueSubmitResult,
  apiKey: string,
  outputType: WorkerRunContext['outputType'],
): Promise<FalQueueStatusResult> {
  const statusResponse = await fetch(queue.statusUrl, {
    headers: { Authorization: `Key ${apiKey}` },
  })

  if (!statusResponse.ok) {
    throw await createProviderResponseError(statusResponse, {
      provider: 'fal',
      phase: 'status_poll',
      fallbackMessage: `fal.ai status poll failed with status ${statusResponse.status}`,
      requestId: queue.requestId,
    })
  }

  const statusData = (await statusResponse.json()) as Record<string, unknown>
  const status = readStringField(statusData, 'status')
  const statusFailure = createProviderPayloadError(statusData, {
    provider: 'fal',
    phase: 'status_poll',
    fallbackMessage: 'fal.ai queue reported failed status.',
    requestId: queue.requestId,
    providerMetadata: {
      statusUrl: queue.statusUrl,
      responseUrl: queue.responseUrl,
    },
  })

  if (statusFailure) {
    return {
      status: 'FAILED',
      error: statusFailure.message,
      errorCode: statusFailure.errorCode,
      providerMetadata: statusFailure.providerMetadata,
    }
  }
  if (status && isFalQueueFailureStatus(status)) {
    return {
      status: 'FAILED',
      error: 'fal.ai queue reported failed status.',
      providerMetadata: {
        requestId: queue.requestId,
        statusUrl: queue.statusUrl,
        responseUrl: queue.responseUrl,
      },
    }
  }
  if (status !== 'COMPLETED') {
    return {
      status: status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'IN_QUEUE',
      providerMetadata: { requestId: queue.requestId },
    }
  }

  const resultResponse = await fetch(queue.responseUrl, {
    headers: { Authorization: `Key ${apiKey}` },
  })

  if (!resultResponse.ok) {
    throw await createProviderResponseError(resultResponse, {
      provider: 'fal',
      phase: 'result_fetch',
      fallbackMessage: `fal.ai result fetch failed with status ${resultResponse.status}`,
      requestId: queue.requestId,
      providerMetadata: {
        statusUrl: queue.statusUrl,
        responseUrl: queue.responseUrl,
      },
    })
  }

  const resultData = (await resultResponse.json()) as Record<string, unknown>
  const resultFailure = createProviderPayloadError(resultData, {
    provider: 'fal',
    phase: 'result_fetch',
    fallbackMessage: 'fal.ai result response reported failure.',
    requestId: queue.requestId,
    providerMetadata: {
      statusUrl: queue.statusUrl,
      responseUrl: queue.responseUrl,
    },
  })
  if (resultFailure) {
    return {
      status: 'FAILED',
      error: resultFailure.message,
      errorCode: resultFailure.errorCode,
      providerMetadata: resultFailure.providerMetadata,
    }
  }

  if (outputType === 'AUDIO') {
    const audio = readFalAudioArtifact(resultData)
    if (!audio.artifactUrl) {
      throw createProviderNoOutputError({
        provider: 'fal',
        phase: 'result_fetch',
        message: 'fal.ai result response did not include an audio URL.',
        requestId: queue.requestId,
        providerMetadata: {
          statusUrl: queue.statusUrl,
          responseUrl: queue.responseUrl,
        },
      })
    }

    return {
      status: 'COMPLETED',
      artifactUrl: audio.artifactUrl,
      mimeType: audio.mimeType ?? 'audio/wav',
      providerMetadata: {
        requestId: queue.requestId,
        statusUrl: queue.statusUrl,
        responseUrl: queue.responseUrl,
      },
    }
  }

  const video = isRecord(resultData.video) ? resultData.video : null
  const artifactUrl = video ? readStringField(video, 'url') : null
  const thumbnail = isRecord(resultData.thumbnail) ? resultData.thumbnail : null
  const thumbnailUrl = thumbnail ? readStringField(thumbnail, 'url') : null

  if (!artifactUrl) {
    throw createProviderNoOutputError({
      provider: 'fal',
      phase: 'result_fetch',
      message: 'fal.ai result response did not include a video URL.',
      requestId: queue.requestId,
      providerMetadata: {
        statusUrl: queue.statusUrl,
        responseUrl: queue.responseUrl,
      },
    })
  }

  return {
    status: 'COMPLETED',
    artifactUrl,
    thumbnailUrl: thumbnailUrl ?? undefined,
    seed: readNumberField(resultData, 'seed') ?? undefined,
    providerMetadata: {
      requestId: queue.requestId,
      statusUrl: queue.statusUrl,
      responseUrl: queue.responseUrl,
    },
  }
}
