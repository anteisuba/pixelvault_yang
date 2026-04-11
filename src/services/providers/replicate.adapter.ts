import 'server-only'

import { z } from 'zod'

import {
  API_USAGE,
  AI_PROVIDER_ENDPOINTS,
  IMAGE_SIZES,
  VIDEO_GENERATION,
} from '@/constants/config'
import { getExecutionModelId } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

import { invertReferenceStrength } from '@/lib/utils'

import {
  ProviderError,
  type HealthCheckInput,
  type ProviderAdapter,
  type ProviderGenerationInput,
  type ProviderVideoInput,
} from '@/services/providers/types'

import { logger } from '@/lib/logger'

const REPLICATE_PREDICTION_SCHEMA = z.object({
  id: z.string(),
  status: z.enum(['starting', 'processing', 'succeeded', 'failed', 'canceled']),
  output: z.unknown().optional(),
  error: z.string().nullable().optional(),
})

const REPLICATE_ASPECT_RATIOS: Record<string, string> = {
  '1:1': '1:1',
  '16:9': '16:9',
  '9:16': '9:16',
  '4:3': '4:3',
  '3:4': '3:4',
}

const POLL_INITIAL_DELAY_MS = 1000
const POLL_MAX_DELAY_MS = 8000
const POLL_TIMEOUT_MS = 180_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Classify raw Replicate errors into user-friendly messages */
function classifyReplicateError(raw: string): string {
  // LoRA incompatible with model
  if (raw.includes('not in the list of present adapters')) {
    return 'LoRA incompatible: This LoRA was trained for a different model. On Civitai, filter by Base Model = "Illustrious" or "SDXL" to find compatible LoRAs.'
  }
  // LoRA URL extension not recognized
  if (raw.includes("isn't supported for LoRA")) {
    return 'LoRA URL format error: The download URL needs a .safetensors file extension. Use a direct download link from Civitai or HuggingFace.'
  }
  // Civitai auth failed
  if (raw.includes('status code: 401') || raw.includes('status code: 403')) {
    return 'LoRA download failed: Authentication error. Make sure your Civitai API token is valid and included in the LoRA URL (?token=your_token).'
  }
  // NSFW content filter
  if (raw.includes('NSFW') || raw.includes('safety')) {
    return 'Content filtered: The generated image was blocked by the safety filter. Try adjusting your prompt.'
  }
  // Out of memory
  if (raw.includes('out of memory') || raw.includes('OOM')) {
    return 'Out of memory: Image size too large or too many LoRAs. Try reducing resolution or removing a LoRA.'
  }
  // Generic with original message
  return `Generation failed: ${raw}`
}

async function pollPrediction(
  predictionUrl: string,
  apiKey: string,
  timeoutMs: number = POLL_TIMEOUT_MS,
): Promise<z.infer<typeof REPLICATE_PREDICTION_SCHEMA>> {
  const startTime = Date.now()
  let delay = POLL_INITIAL_DELAY_MS

  while (Date.now() - startTime < timeoutMs) {
    await sleep(delay)

    const response = await fetch(predictionUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error')
      logger.error('Replicate pollPrediction failed', {
        status: response.status,
        predictionUrl,
        errorBody: errorBody.slice(0, 500),
      })
      throw new ProviderError('Replicate', response.status, errorBody)
    }

    const prediction = REPLICATE_PREDICTION_SCHEMA.parse(await response.json())

    if (prediction.status === 'succeeded') {
      return prediction
    }

    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      const rawError = prediction.error ?? 'Unknown error'
      throw new ProviderError(
        'Replicate',
        502,
        classifyReplicateError(rawError),
      )
    }

    // Exponential backoff
    delay = Math.min(delay * 2, POLL_MAX_DELAY_MS)
  }

  throw new ProviderError(
    'Replicate',
    504,
    `Prediction timed out after ${Math.round(timeoutMs / 1000)}s`,
  )
}

function extractImageUrl(output: unknown): string {
  // Output can be a string URL, an array of URLs, or an object with a url field
  if (typeof output === 'string') return output

  if (Array.isArray(output)) {
    const first = output[0]
    if (typeof first === 'string') return first
    if (first && typeof first === 'object' && 'url' in first) {
      return String((first as { url: unknown }).url)
    }
  }

  if (output && typeof output === 'object' && 'url' in output) {
    return String((output as { url: unknown }).url)
  }

  throw new ProviderError(
    'Replicate',
    502,
    'Could not extract image URL from output',
  )
}

// ─── Private helpers ────────────────────────────────────────────

/** Build input payload for NoobAI/Illustrious XL models */
function buildNoobAIInput(
  prompt: string,
  width: number,
  height: number,
  advancedParams: ProviderGenerationInput['advancedParams'],
): Record<string, unknown> {
  const input: Record<string, unknown> = { prompt, width, height }
  if (advancedParams?.negativePrompt)
    input.negative_prompt = advancedParams.negativePrompt
  if (advancedParams?.guidanceScale != null)
    input.cfg_scale = advancedParams.guidanceScale
  if (advancedParams?.steps != null) input.steps = advancedParams.steps
  return input
}

/** Build input payload for FLUX and other standard Replicate models */
function buildFluxInput(
  prompt: string,
  aspectRatio: string,
  advancedParams: ProviderGenerationInput['advancedParams'],
): Record<string, unknown> {
  const input: Record<string, unknown> = {
    prompt,
    aspect_ratio: REPLICATE_ASPECT_RATIOS[aspectRatio] ?? '1:1',
  }
  if (advancedParams?.negativePrompt)
    input.negative_prompt = advancedParams.negativePrompt
  if (advancedParams?.guidanceScale != null)
    input.guidance_scale = advancedParams.guidanceScale
  if (advancedParams?.steps != null)
    input.num_inference_steps = advancedParams.steps
  return input
}

/**
 * Resolve Civitai download URLs to CDN URLs with .safetensors extension.
 * NoobAI requires the file extension in the URL.
 */
async function resolveCivitaiUrl(url: string): Promise<string> {
  if (!url.includes('civitai.com/api/download')) return url
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'manual' })
    const cdnUrl = res.headers.get('location')
    if (cdnUrl?.includes('.safetensors')) return cdnUrl
  } catch {
    /* fallback to original URL */
  }
  return url
}

/** Apply LoRA parameters to the input object (mutates in place) */
async function applyLoraParams(
  input: Record<string, unknown>,
  loras: Array<{ url: string; scale?: number | null }>,
  isNoobAI: boolean,
): Promise<void> {
  if (isNoobAI) {
    // NoobAI: JSON array of {url, strength}. Resolve Civitai URLs first.
    const resolved = await Promise.all(
      loras.map(async (lora) => ({
        url: await resolveCivitaiUrl(lora.url),
        strength: lora.scale ?? 1.0,
      })),
    )
    input.loras = JSON.stringify(resolved)
  } else {
    // FLUX: single hf_lora field
    input.hf_lora = loras[0].url
    if (loras[0].scale != null) input.lora_scale = loras[0].scale
  }
}

/**
 * Resolve the prediction request body.
 * Official models use `model`, community models need `version` hash.
 */
async function resolveModelBody(
  externalModelId: string,
  isNoobAI: boolean,
  input: Record<string, unknown>,
  apiKey: string,
  baseUrl: string,
): Promise<Record<string, unknown>> {
  if (!isNoobAI) return { model: externalModelId, input }

  const modelRes = await fetch(`${baseUrl}/models/${externalModelId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!modelRes.ok) {
    throw new ProviderError(
      'Replicate',
      modelRes.status,
      `Model ${externalModelId} not found`,
    )
  }
  const modelData = (await modelRes.json()) as {
    latest_version?: { id: string }
  }
  const versionHash = modelData.latest_version?.id
  if (!versionHash) {
    throw new ProviderError(
      'Replicate',
      404,
      `No version found for ${externalModelId}`,
    )
  }
  return { version: versionHash, input }
}

// ─── Adapter ────────────────────────────────────────────────────

export const replicateAdapter: ProviderAdapter = {
  adapterType: AI_ADAPTER_TYPES.REPLICATE,
  async generateImage({
    prompt,
    modelId,
    aspectRatio,
    providerConfig,
    apiKey,
    referenceImage,
    referenceImages,
    advancedParams,
  }: ProviderGenerationInput) {
    const { width, height } = IMAGE_SIZES[aspectRatio] ?? IMAGE_SIZES['1:1']
    const baseUrl = providerConfig.baseUrl || AI_PROVIDER_ENDPOINTS.REPLICATE
    const externalModelId = getExecutionModelId(modelId)
    const endpoint = `${baseUrl}/predictions`
    const isNoobAI = externalModelId.includes('noobai')

    const input: Record<string, unknown> = isNoobAI
      ? buildNoobAIInput(prompt, width, height, advancedParams)
      : buildFluxInput(prompt, aspectRatio, advancedParams)

    if (advancedParams?.seed != null && advancedParams.seed >= 0) {
      input.seed = advancedParams.seed
    }

    if (advancedParams?.loras?.length) {
      await applyLoraParams(input, advancedParams.loras, isNoobAI)
    }

    const effectiveRefImage = referenceImages?.[0] ?? referenceImage
    if (effectiveRefImage) {
      input.image = effectiveRefImage
      if (advancedParams?.referenceStrength != null) {
        input.strength = invertReferenceStrength(
          advancedParams.referenceStrength,
        )
      }
    }

    const predBody = await resolveModelBody(
      externalModelId,
      isNoobAI,
      input,
      apiKey,
      baseUrl,
    )

    logger.debug('[Replicate] generateImage request', {
      endpoint,
      modelId: externalModelId,
      isNoobAI,
    })

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(predBody),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error')
      logger.error('Replicate generateImage failed', {
        status: response.status,
        modelId,
        endpoint,
        errorBody: errorBody.slice(0, 500),
      })
      throw new ProviderError('Replicate', response.status, errorBody)
    }

    const prediction = REPLICATE_PREDICTION_SCHEMA.parse(await response.json())

    // If already succeeded (unlikely but possible)
    if (prediction.status === 'succeeded' && prediction.output) {
      return {
        imageUrl: extractImageUrl(prediction.output),
        width,
        height,
        requestCount: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
      }
    }

    // Poll for completion
    const pollUrl = `${baseUrl}/predictions/${prediction.id}`
    const completed = await pollPrediction(pollUrl, apiKey)

    return {
      imageUrl: extractImageUrl(completed.output),
      width,
      height,
      requestCount: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
    }
  },

  async generateVideo({
    prompt,
    modelId,
    aspectRatio,
    providerConfig,
    apiKey,
    duration,
    referenceImage,
    timeoutMs,
  }: ProviderVideoInput) {
    const { width, height } = IMAGE_SIZES[aspectRatio] ?? IMAGE_SIZES['16:9']
    const baseUrl = providerConfig.baseUrl || AI_PROVIDER_ENDPOINTS.REPLICATE
    const endpoint = `${baseUrl}/predictions`
    const externalModelId = getExecutionModelId(modelId)

    const input: Record<string, unknown> = {
      prompt,
      aspect_ratio: REPLICATE_ASPECT_RATIOS[aspectRatio] ?? '16:9',
      duration: duration ?? VIDEO_GENERATION.DEFAULT_DURATION,
    }

    if (referenceImage) {
      input.image = referenceImage
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: externalModelId,
        input,
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error')
      logger.error('Replicate generateVideo failed', {
        status: response.status,
        modelId,
        endpoint,
        errorBody: errorBody.slice(0, 500),
      })
      throw new ProviderError('Replicate', response.status, errorBody)
    }

    const prediction = REPLICATE_PREDICTION_SCHEMA.parse(await response.json())

    if (prediction.status === 'succeeded' && prediction.output) {
      return {
        videoUrl: extractImageUrl(prediction.output),
        width,
        height,
        duration: duration ?? VIDEO_GENERATION.DEFAULT_DURATION,
        requestCount: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
      }
    }

    const pollUrl = `${baseUrl}/predictions/${prediction.id}`
    const completed = await pollPrediction(
      pollUrl,
      apiKey,
      timeoutMs ?? 180_000,
    )

    return {
      videoUrl: extractImageUrl(completed.output),
      width,
      height,
      duration: duration ?? VIDEO_GENERATION.DEFAULT_DURATION,
      requestCount: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
    }
  },

  async healthCheck({ modelId, apiKey, baseUrl, timeoutMs }: HealthCheckInput) {
    const start = Date.now()
    try {
      const [owner, name] = modelId.split('/')
      if (!owner || !name) {
        return {
          status: 'unavailable' as const,
          latencyMs: Date.now() - start,
          error: 'Invalid Replicate model ID format',
        }
      }
      const endpoint = `${baseUrl}/models/${owner}/${name}`
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(timeoutMs),
      })
      const latencyMs = Date.now() - start
      if (response.ok) {
        return { status: 'available' as const, latencyMs }
      }
      return {
        status: 'unavailable' as const,
        latencyMs,
        error: `HTTP ${response.status}`,
      }
    } catch (err) {
      return {
        status: 'unavailable' as const,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : 'Unknown error',
      }
    }
  },
}

// ─── LoRA Training (standalone functions, not part of ProviderAdapter) ──

const REPLICATE_TRAINING_SCHEMA = z.object({
  id: z.string(),
  status: z.enum(['starting', 'processing', 'succeeded', 'failed', 'canceled']),
  output: z.unknown().optional(),
  error: z.string().nullable().optional(),
  logs: z.string().optional(),
  metrics: z.record(z.string(), z.unknown()).optional(),
})

export type ReplicateTrainingStatus = z.infer<
  typeof REPLICATE_TRAINING_SCHEMA
>['status']

/**
 * Submit a LoRA training job to Replicate's fast-flux-trainer.
 * Returns the training ID for status polling.
 */
export async function submitReplicateLoraTraining(input: {
  apiKey: string
  inputImagesUrl: string
  triggerWord: string
  loraType: 'subject' | 'style'
  destinationOwner?: string
}): Promise<{ trainingId: string }> {
  const baseUrl = AI_PROVIDER_ENDPOINTS.REPLICATE

  // Step 0: Get the Replicate account username for destination
  let owner = input.destinationOwner
  if (!owner) {
    const accountRes = await fetch(`${baseUrl}/account`, {
      headers: { Authorization: `Bearer ${input.apiKey}` },
    })
    if (accountRes.ok) {
      const accountData = (await accountRes.json()) as { username?: string }
      owner = accountData.username
    }
    if (!owner) {
      // Fallback: use trigger word slug as owner won't work, but we need something
      throw new ProviderError(
        'Replicate',
        400,
        'Could not determine Replicate username. Check your API key.',
      )
    }
  }

  // Step 1: Get latest version of fast-flux-trainer
  const modelRes = await fetch(
    `${baseUrl}/models/replicate/fast-flux-trainer`,
    { headers: { Authorization: `Bearer ${input.apiKey}` } },
  )
  if (!modelRes.ok) {
    const err = await modelRes.text().catch(() => 'Unknown error')
    throw new ProviderError(
      'Replicate',
      modelRes.status,
      `Failed to fetch trainer model: ${err}`,
    )
  }
  const modelData = (await modelRes.json()) as {
    latest_version?: { id?: string }
  }
  const versionId = modelData.latest_version?.id
  if (!versionId) {
    throw new ProviderError(
      'Replicate',
      500,
      'Could not determine trainer version',
    )
  }

  // Step 2: Create destination model (ignore 409 = already exists)
  const destName = `lora-${input.triggerWord.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`
  const destination = `${owner}/${destName}`

  const createModelRes = await fetch(`${baseUrl}/models`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      owner,
      name: destName,
      visibility: 'private',
      hardware: 'cpu',
      description: `LoRA trained via PixelVault (trigger: ${input.triggerWord})`,
    }),
  })
  // 409 = model already exists, that's fine
  if (!createModelRes.ok && createModelRes.status !== 409) {
    const err = await createModelRes.text().catch(() => 'Unknown error')
    logger.warn('Failed to create destination model (non-fatal)', {
      status: createModelRes.status,
      err: err.slice(0, 200),
    })
  }

  // Step 3: Submit training with version ID
  const url = `${baseUrl}/models/replicate/fast-flux-trainer/versions/${versionId}/trainings`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      destination,
      input: {
        input_images: input.inputImagesUrl,
        trigger_word: input.triggerWord,
        lora_type: input.loraType,
      },
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    logger.error('Replicate submitLoraTraining failed', {
      status: response.status,
      errorBody: errorBody.slice(0, 500),
    })
    throw new ProviderError('Replicate', response.status, errorBody)
  }

  const data = REPLICATE_TRAINING_SCHEMA.parse(await response.json())
  return { trainingId: data.id }
}

/**
 * Check status of a Replicate LoRA training job.
 */
export async function checkReplicateLoraTrainingStatus(input: {
  apiKey: string
  trainingId: string
}): Promise<{
  status: ReplicateTrainingStatus
  loraUrl: string | null
  error: string | null
  logs: string | null
}> {
  const baseUrl = AI_PROVIDER_ENDPOINTS.REPLICATE

  const url = `${baseUrl}/trainings/${input.trainingId}`

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${input.apiKey}` },
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw new ProviderError('Replicate', response.status, errorBody)
  }

  const data = REPLICATE_TRAINING_SCHEMA.parse(await response.json())

  // Extract LoRA weights URL from output
  let loraUrl: string | null = null
  if (data.status === 'succeeded' && data.output) {
    const output = data.output as Record<string, unknown>
    loraUrl = (output.weights as string) ?? (output.version as string) ?? null
  }

  return {
    status: data.status,
    loraUrl,
    error: data.error ?? null,
    logs: data.logs ?? null,
  }
}
