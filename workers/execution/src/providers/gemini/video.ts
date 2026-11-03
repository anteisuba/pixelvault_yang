import type {
  ExecutionEnv,
  FalQueueStatusResult,
  FalQueueSubmitResult,
  WorkerRunContext,
} from '../../index'
import { reportProviderJobId } from '../../lib/app-bridge'
import { isRecord, readStringField } from '../../lib/fields'
import { JSON_CONTENT_TYPE } from '../../lib/http'
import { readReferenceImageAsInlinePart } from '../../lib/image-io'
import {
  createProviderNoOutputError,
  createProviderPayloadError,
  createProviderResponseError,
} from '../../lib/provider-error'

export const GEMINI_VIDEO_BASE_URL =
  'https://generativelanguage.googleapis.com/v1beta'

// ─── Provider dispatch ───────────────────────────────────────────
// One seam for both call sites in CinematicShortVideoWorkflow. fal remains the
// fallthrough so existing routes are untouched by adding providers here.

export async function submitGeminiVideoQueue(
  context: WorkerRunContext,
  apiKey: string,
  env: ExecutionEnv,
): Promise<FalQueueSubmitResult> {
  if (context.outputType !== 'VIDEO')
    throw new Error('Gemini requires video input.')
  const input = context.providerInput
  if (input.audioUrls?.length || input.videoUrls?.length) {
    throw new Error(
      'Gemini video execution supports text and image references only.',
    )
  }
  if (!['16:9', '9:16'].includes(input.aspectRatio)) {
    throw new Error('Gemini video requires a 16:9 or 9:16 aspect ratio.')
  }
  const references = [
    ...new Set([
      ...(input.referenceImage ? [input.referenceImage] : []),
      ...(input.referenceImages ?? []),
    ]),
  ]
  const parts: Record<string, unknown>[] = []
  for (const reference of references) {
    const part = await readReferenceImageAsInlinePart(reference)
    const image = part.inlineData as { mimeType: string; data: string }
    parts.push({ type: 'image', mime_type: image.mimeType, data: image.data })
  }
  parts.push({ type: 'text', text: input.prompt })
  // URI delivery keeps video bytes out of durable workflow state. Unary
  // generation avoids GET /interactions returning inline video despite URI delivery.
  const response = await fetch(`${GEMINI_VIDEO_BASE_URL}/interactions`, {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'Content-Type': JSON_CONTENT_TYPE },
    body: JSON.stringify({
      model: input.externalModelId,
      input: parts,
      background: false,
      store: false,
      stream: false,
      response_format: {
        type: 'video',
        delivery: 'uri',
        aspect_ratio: input.aspectRatio,
        resolution: input.resolution ?? '720p',
      },
    }),
    signal: AbortSignal.timeout(context.timeoutMs),
  })
  if (!response.ok) {
    throw await createProviderResponseError(response, {
      provider: 'gemini',
      phase: 'queue_submit',
      fallbackMessage: 'Gemini video generation failed.',
    })
  }
  const data: unknown = await response.json()
  if (!isRecord(data)) throw new Error('Invalid Gemini interaction response.')
  const failure = createProviderPayloadError(data, {
    provider: 'gemini',
    phase: 'queue_submit',
    fallbackMessage: 'Gemini video generation failed.',
  })
  if (failure) throw failure
  const steps = Array.isArray(data.steps) ? data.steps : []
  const video = steps
    .flatMap((step) =>
      isRecord(step) &&
      step.type === 'model_output' &&
      Array.isArray(step.content)
        ? step.content
        : [],
    )
    .find((part: unknown) => isRecord(part) && part.type === 'video')
  const uri = isRecord(video) ? readStringField(video, 'uri') : null
  const requestId = readStringField(data, 'id')
  if (!uri || !requestId || data.status !== 'completed') {
    throw createProviderNoOutputError({
      provider: 'gemini',
      phase: 'queue_submit',
      message: 'Gemini did not return a completed video file.',
    })
  }
  // Reconstruct both URLs from a validated file name; never attach BYOK to
  // an arbitrary URI or persist provider query parameters in workflow state.
  const fileUrl = new URL(uri)
  const match = fileUrl.pathname.match(
    /^\/v1beta\/files\/([A-Za-z0-9_-]+)(?::download)?$/,
  )
  if (fileUrl.origin !== new URL(GEMINI_VIDEO_BASE_URL).origin || !match) {
    throw new Error('Gemini returned an invalid video file URI.')
  }
  const statusUrl = `${GEMINI_VIDEO_BASE_URL}/files/${match[1]}`
  await reportProviderJobId(env, context, requestId)
  return {
    requestId,
    statusUrl,
    responseUrl: `${statusUrl}:download?alt=media`,
  }
}

export async function pollGeminiVideoQueue(
  queue: FalQueueSubmitResult,
  apiKey: string,
): Promise<FalQueueStatusResult> {
  const response = await fetch(queue.statusUrl, {
    headers: { 'x-goog-api-key': apiKey },
  })
  if (!response.ok) {
    throw await createProviderResponseError(response, {
      provider: 'gemini',
      phase: 'provider_poll',
      fallbackMessage: 'Gemini video file polling failed.',
    })
  }
  const data: unknown = await response.json()
  if (!isRecord(data)) throw new Error('Invalid Gemini file response.')
  if (data.state === 'FAILED') {
    // 官方 File 资源：失败时 error 是 Status { code, message }。
    const reason = isRecord(data.error) ? data.error.message : undefined
    return {
      status: 'FAILED',
      error:
        typeof reason === 'string' && reason
          ? `Gemini video file processing failed: ${reason}`
          : 'Gemini video file processing failed.',
    }
  }
  // 官方：STATE_UNSPECIFIED = 没给状态时的默认值，当成还在处理。
  if (
    data.state === 'PROCESSING' ||
    data.state === 'STATE_UNSPECIFIED' ||
    data.state === undefined
  )
    return { status: 'IN_PROGRESS' }
  if (data.state !== 'ACTIVE')
    throw new Error('Unknown Gemini video file state.')
  return {
    status: 'COMPLETED',
    artifactUrl: queue.responseUrl,
    mimeType: 'video/mp4',
    providerMetadata: { requestId: queue.requestId },
  }
}
