import type { ExecutionEnv, WorkerImageRunContext } from '../../index'
import { reportProviderJobId } from '../../lib/app-bridge'
import {
  isRecord,
  readNumberField,
  readPositiveNumberField,
  readStringField,
} from '../../lib/fields'
import { JSON_CONTENT_TYPE } from '../../lib/http'
import {
  getImageLoraInputs,
  getImageReferenceInputs,
  getStandardImageDimensions,
  injectCivitaiToken,
  invertReferenceStrength,
  R2_WORKER_BASE,
  readAdvancedRecord,
} from '../../lib/image-io'
import {
  createGenerationWaitLimitError,
  createProviderResponseError,
} from '../../lib/provider-error'
import { REPLICATE_BASE_URL } from './api'
import { resolveRunCivitaiToken } from '../../lib/app-bridge'
import {
  downloadAndUploadImageArtifactToKey,
  getWorkerImageOutputKey,
  hasCivitaiLora,
} from '../../lib/image-io'
import { WorkerProviderError } from '../../lib/provider-error'
import { RETRY_TWICE } from '../multi-step'
import { imageStepNames, type MultiStepImageDriver } from '../types'

export const OLD_R2_DEV_PATTERN = /^https:\/\/pub-[a-f0-9]+\.r2\.dev\//

export function toReplicateReachableUrl(
  url: string,
  env: ExecutionEnv,
): string {
  if (OLD_R2_DEV_PATTERN.test(url)) {
    const key = url.replace(OLD_R2_DEV_PATTERN, '')
    return `${R2_WORKER_BASE}/${key}`
  }

  const publicBase = env.R2_PUBLIC_URL.replace(/\/$/, '')
  if (url.startsWith(`${publicBase}/`)) {
    const key = url.slice(publicBase.length + 1)
    return `${R2_WORKER_BASE}/${key}`
  }

  return url
}

export async function resolveReplicateCivitaiUrl(
  url: string,
  civitaiToken: string | null,
): Promise<string> {
  if (!url.includes('civitai.com/api/download')) return url

  if (civitaiToken) {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        redirect: 'manual',
        headers: { Authorization: `Bearer ${civitaiToken}` },
      })
      const cdnUrl = response.headers.get('location')
      if (cdnUrl?.includes('.safetensors')) return cdnUrl
    } catch {
      // Fall through to token-in-URL mode; Replicate's downloader follows
      // redirects but cannot attach Authorization headers for Civitai.
    }
  }

  return injectCivitaiToken(url, civitaiToken)
}

export function readReplicatePrediction(payload: unknown): ReplicatePrediction {
  if (!isRecord(payload)) {
    throw new Error('Replicate returned an invalid prediction response.')
  }
  const id = readStringField(payload, 'id')
  const status = readStringField(payload, 'status')
  if (
    !id ||
    (status !== 'starting' &&
      status !== 'processing' &&
      status !== 'succeeded' &&
      status !== 'failed' &&
      status !== 'canceled')
  ) {
    throw new Error('Replicate prediction response is missing id or status.')
  }
  return { id, status, output: payload.output, error: payload.error }
}

export function getReplicateImageSchema(
  context: WorkerImageRunContext,
): 'flux' | 'sdxl' {
  if (
    context.providerInput.modelId === 'illustrious-xl' ||
    context.providerInput.externalModelId.includes('noobai')
  ) {
    return 'sdxl'
  }
  return 'flux'
}

export async function buildReplicateImageInput(
  context: WorkerImageRunContext,
  env: ExecutionEnv,
  civitaiToken: string | null = null,
): Promise<Record<string, unknown>> {
  const advancedParams = readAdvancedRecord(context)
  const schema = getReplicateImageSchema(context)

  const dimensions = getStandardImageDimensions(
    context.providerInput.aspectRatio,
  )
  const input: Record<string, unknown> =
    schema === 'sdxl'
      ? {
          prompt: context.providerInput.prompt,
          width: dimensions.width,
          height: dimensions.height,
        }
      : {
          prompt: context.providerInput.prompt,
          aspect_ratio: context.providerInput.aspectRatio,
        }

  const negativePrompt = readStringField(advancedParams, 'negativePrompt')
  if (negativePrompt) input.negative_prompt = negativePrompt
  const guidanceScale = readNumberField(advancedParams, 'guidanceScale')
  if (guidanceScale != null) {
    input[schema === 'sdxl' ? 'cfg_scale' : 'guidance_scale'] = guidanceScale
  }
  const steps = readPositiveNumberField(advancedParams, 'steps')
  if (steps != null) {
    input[schema === 'sdxl' ? 'steps' : 'num_inference_steps'] = steps
  }
  const seed = readNumberField(advancedParams, 'seed')
  if (seed != null && seed >= 0) input.seed = Math.round(seed)

  const loras = getImageLoraInputs(context)
  if (loras.length > 0) {
    if (schema === 'sdxl') {
      const resolved = await Promise.all(
        loras.map(async (lora) => {
          const resolvedUrl = await resolveReplicateCivitaiUrl(
            lora.url,
            civitaiToken,
          )
          return {
            url: toReplicateReachableUrl(resolvedUrl, env),
            strength: lora.scale ?? 1,
          }
        }),
      )
      input.loras = JSON.stringify(resolved)
    } else {
      const first = loras[0]
      if (first) {
        const resolvedUrl = await resolveReplicateCivitaiUrl(
          first.url,
          civitaiToken,
        )
        input.hf_lora = toReplicateReachableUrl(resolvedUrl, env)
        if (first.scale != null) input.lora_scale = first.scale
      }
    }
  }

  const referenceImage = getImageReferenceInputs(context)[0]
  if (referenceImage) {
    input.image = referenceImage
    const referenceStrength = readNumberField(
      advancedParams,
      'referenceStrength',
    )
    if (referenceStrength != null) {
      input.strength = invertReferenceStrength(referenceStrength)
    }
  }

  return input
}

export async function buildReplicatePredictionBody(
  context: WorkerImageRunContext,
  env: ExecutionEnv,
  apiKey: string,
  civitaiToken: string | null = null,
): Promise<Record<string, unknown>> {
  const input = await buildReplicateImageInput(context, env, civitaiToken)
  if (getReplicateImageSchema(context) === 'flux') {
    return { model: context.providerInput.externalModelId, input }
  }

  const modelResponse = await fetch(
    `${REPLICATE_BASE_URL}/models/${context.providerInput.externalModelId}`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  )
  if (!modelResponse.ok) {
    throw await createProviderResponseError(modelResponse, {
      provider: 'replicate',
      phase: 'model_lookup',
      fallbackMessage: `Replicate model lookup failed with status ${modelResponse.status}`,
    })
  }
  const model = (await modelResponse.json()) as Record<string, unknown>
  const latestVersion = isRecord(model.latest_version)
    ? readStringField(model.latest_version, 'id')
    : null
  if (!latestVersion) {
    throw new Error('Replicate model response did not include latest version.')
  }
  return { version: latestVersion, input }
}

export async function submitReplicateImagePrediction(
  context: WorkerImageRunContext,
  env: ExecutionEnv,
  apiKey: string,
  civitaiToken: string | null = null,
): Promise<ReplicatePrediction> {
  const response = await fetch(`${REPLICATE_BASE_URL}/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': JSON_CONTENT_TYPE,
    },
    body: JSON.stringify(
      await buildReplicatePredictionBody(context, env, apiKey, civitaiToken),
    ),
  })

  if (!response.ok) {
    throw await createProviderResponseError(response, {
      provider: 'replicate',
      phase: 'prediction_submit',
      fallbackMessage: `Replicate prediction submit failed with status ${response.status}`,
    })
  }

  const prediction = readReplicatePrediction(await response.json())
  await reportProviderJobId(env, context, prediction.id)
  return prediction
}

export async function pollReplicateImagePrediction(
  predictionId: string,
  apiKey: string,
): Promise<ReplicatePrediction> {
  const response = await fetch(
    `${REPLICATE_BASE_URL}/predictions/${predictionId}`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
    },
  )
  if (!response.ok) {
    throw await createProviderResponseError(response, {
      provider: 'replicate',
      phase: 'prediction_poll',
      fallbackMessage: `Replicate poll failed with status ${response.status}`,
      requestId: predictionId,
    })
  }
  return readReplicatePrediction(await response.json())
}

export function extractReplicateImageUrl(output: unknown): string {
  if (typeof output === 'string') return output
  if (Array.isArray(output)) {
    const first = output[0]
    if (typeof first === 'string') return first
    if (isRecord(first)) {
      const url = readStringField(first, 'url')
      if (url) return url
    }
  }
  if (isRecord(output)) {
    const url = readStringField(output, 'url')
    if (url) return url
  }
  throw new Error('Replicate output did not include an image URL.')
}

export interface ReplicatePrediction {
  id: string
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'
  output?: unknown
  error?: unknown
}

/** 出完的预测带上出图地址：地址在步骤外读，读不出来直接判失败、不进上传步骤重试。 */
export type CompletedReplicatePrediction = ReplicatePrediction & {
  imageUrl: string
}

export function completeReplicatePrediction(
  prediction: ReplicatePrediction,
): CompletedReplicatePrediction {
  return {
    ...prediction,
    imageUrl: extractReplicateImageUrl(prediction.output),
  }
}

export const replicateImageDriver: MultiStepImageDriver<
  ReplicatePrediction,
  ReplicatePrediction,
  CompletedReplicatePrediction
> = {
  stepNames: imageStepNames('replicate'),
  submitStep: { retries: RETRY_TWICE, timeout: '30 seconds' },
  pollStep: { retries: RETRY_TWICE, timeout: '30 seconds' },
  async submit({ env, context, readApiKey }) {
    const apiKey = await readApiKey()
    const civitaiToken = hasCivitaiLora(context)
      ? await resolveRunCivitaiToken(env, context)
      : null
    return submitReplicateImagePrediction(context, env, apiKey, civitaiToken)
  },
  doneOnSubmit: (prediction) =>
    prediction.status === 'succeeded'
      ? completeReplicatePrediction(prediction)
      : undefined,
  async poll({ readApiKey }, prediction) {
    return pollReplicateImagePrediction(prediction.id, await readApiKey())
  },
  readPoll(polled, _prediction, context) {
    if (polled.status === 'failed' || polled.status === 'canceled') {
      throw new WorkerProviderError({
        message: `Replicate image generation failed: ${String(
          polled.error ?? 'unknown',
        )}`,
        provider: context.providerId,
        phase: 'prediction_poll',
        requestId: polled.id,
        providerMetadata: {
          predictionId: polled.id,
          status: polled.status,
          providerError: polled.error,
        },
      })
    }
    return polled.status === 'succeeded'
      ? { state: 'done', value: completeReplicatePrediction(polled) }
      : { state: 'pending' }
  },
  timeoutError: () =>
    createGenerationWaitLimitError({
      provider: 'replicate',
      phase: 'image_poll',
    }),
  upload: {
    step: { retries: RETRY_TWICE, timeout: '120 seconds' },
    async run({ env, context, readApiKey }, _prediction, completed) {
      const apiKey = await readApiKey()
      return downloadAndUploadImageArtifactToKey(
        env,
        completed.imageUrl,
        'image/png',
        getWorkerImageOutputKey(context),
        { Authorization: `Bearer ${apiKey}` },
      )
    },
  },
  toResult(_prediction, completed, uploaded, context) {
    if (!uploaded) throw new Error('Replicate image upload result is missing.')
    return {
      ...uploaded,
      ...getStandardImageDimensions(context.providerInput.aspectRatio),
      providerMetadata: { predictionId: completed.id },
    }
  },
}
