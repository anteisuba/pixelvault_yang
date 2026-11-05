import type { ExecutionEnv, WorkerImageRunContext } from '../../index'
import { reportProviderJobId } from '../../lib/app-bridge'
import { isRecord, readStringField } from '../../lib/fields'
import {
  createImageEditBody,
  getImageReferenceInputs,
} from '../../lib/image-io'
import {
  asWaitLimitIfAbortTimeout,
  createGenerationWaitLimitError,
  createProviderNoOutputError,
  createProviderResponseError,
} from '../../lib/provider-error'
import {
  buildIdeogramImageRequest,
  IDEOGRAM_API_BASE,
  type IdeogramPollResult,
  parseIdeogramGeneration,
} from './image-request-builder'
import {
  downloadAndUploadImageArtifactToKey,
  getWorkerImageOutputKey,
} from '../../lib/image-io'
import { RETRY_TWICE } from '../multi-step'
import { imageStepNames, type MultiStepImageDriver } from '../types'

export async function submitIdeogramImageQueue(
  env: ExecutionEnv,
  context: WorkerImageRunContext,
  apiKey: string,
): Promise<string> {
  const request = buildIdeogramImageRequest({
    ...context.providerInput,
    referenceImages: getImageReferenceInputs(context),
  })
  const multipart =
    request.files.length > 0
      ? createImageEditBody(
          env,
          request.fields,
          request.files.map((file) => file.url),
          {
            provider: 'ideogram',
            fileFields: request.files.map((file) => file.field),
            maxBytes: 25 * 1024 * 1024,
          },
        )
      : undefined
  try {
    const response = await fetch(`${IDEOGRAM_API_BASE}${request.path}`, {
      method: 'POST',
      headers: {
        'Api-Key': apiKey,
        'Content-Type': multipart?.contentType ?? 'application/json',
      },
      body: multipart?.body ?? JSON.stringify(request.fields),
      signal: multipart
        ? AbortSignal.any([multipart.signal, AbortSignal.timeout(120_000)])
        : AbortSignal.timeout(120_000),
    })
    if (!response.ok)
      throw await createProviderResponseError(response, {
        provider: 'ideogram',
        phase: 'image_submit',
        fallbackMessage: 'Ideogram image submission failed.',
      })
    const payload: unknown = await response.json()
    const generationId = isRecord(payload)
      ? readStringField(payload, 'generation_id')
      : null
    if (!generationId || !/^[A-Za-z0-9_-]+$/.test(generationId))
      throw createProviderNoOutputError({
        provider: 'ideogram',
        phase: 'image_submit',
        message: 'Ideogram accepted the request without a generation ID.',
      })
    await reportProviderJobId(env, context, generationId)
    return generationId
  } catch (error) {
    throw asWaitLimitIfAbortTimeout(error, {
      provider: 'ideogram',
      phase: 'image_submit',
    })
  } finally {
    multipart?.cancel('Submission finished')
  }
}

export async function pollIdeogramImageQueue(
  generationId: string,
  apiKey: string,
): Promise<IdeogramPollResult> {
  const response = await fetch(
    `${IDEOGRAM_API_BASE}/v2/generations/${encodeURIComponent(generationId)}`,
    {
      headers: { 'Api-Key': apiKey },
      signal: AbortSignal.timeout(30_000),
    },
  )
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('Retry-After'))
    return {
      status: 'pending',
      retryAfterMs:
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 5000,
    }
  }
  if (!response.ok)
    throw await createProviderResponseError(response, {
      provider: 'ideogram',
      phase: 'image_poll',
      requestId: generationId,
      fallbackMessage: 'Ideogram status check failed.',
    })
  return parseIdeogramGeneration(await response.json(), generationId)
}

export const ideogramImageDriver: MultiStepImageDriver<
  string,
  IdeogramPollResult,
  Extract<IdeogramPollResult, { status: 'completed' }>
> = {
  stepNames: imageStepNames('ideogram'),
  submitStep: {
    retries: { limit: 0, delay: '1 second', backoff: 'constant' },
    timeout: '150 seconds',
  },
  pollStep: { retries: RETRY_TWICE, timeout: '40 seconds' },
  async submit({ env, context, readApiKey }) {
    return submitIdeogramImageQueue(env, context, await readApiKey())
  },
  async poll({ readApiKey }, generationId) {
    return pollIdeogramImageQueue(generationId, await readApiKey())
  },
  readPoll: (polled) =>
    polled.status === 'completed'
      ? { state: 'done', value: polled }
      : { state: 'pending', nextDelayMs: polled.retryAfterMs },
  timeoutError: (generationId) =>
    createGenerationWaitLimitError({
      provider: 'ideogram',
      phase: 'image_poll',
      requestId: generationId,
    }),
  upload: {
    step: { retries: RETRY_TWICE, timeout: '120 seconds' },
    run: ({ env, context }, _generationId, image) =>
      downloadAndUploadImageArtifactToKey(
        env,
        image.imageUrl,
        'image/png',
        getWorkerImageOutputKey(context),
      ),
  },
  toResult(_generationId, image, uploaded) {
    if (!uploaded) throw new Error('Ideogram image upload result is missing.')
    return {
      ...uploaded,
      width: image.width,
      height: image.height,
      providerMetadata: image.providerMetadata,
    }
  },
}
