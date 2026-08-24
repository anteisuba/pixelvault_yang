import 'server-only'

import { z } from 'zod'

import { API_USAGE, AI_PROVIDER_ENDPOINTS } from '@/constants/config'
import { getExecutionModelId } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  GENERATION_ERROR_CODES,
  parseGenerationErrorCode,
  type GenerationErrorCode,
} from '@/constants/generation-errors'

/**
 * Normalize fal.ai error responses into raw provider detail + project error code.
 * fal.ai model errors use `detail: [{ type, msg, ... }]`; request errors can
 * also use `{ detail, error_type }`.
 */
interface FalErrorDetails {
  message: string
  errorCode: GenerationErrorCode
}

interface FalErrorParts {
  messages: string[]
  types: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function pushText(target: string[], value: unknown): void {
  if (typeof value !== 'string') return
  const trimmed = value.trim()
  if (trimmed.length > 0) {
    target.push(trimmed)
  }
}

function collectFalErrorParts(value: unknown, parts: FalErrorParts): void {
  if (!value) return

  if (typeof value === 'string') {
    pushText(parts.messages, value)
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectFalErrorParts(item, parts)
    }
    return
  }

  if (!isRecord(value)) return

  pushText(parts.messages, value.msg)
  pushText(parts.messages, value.message)
  pushText(parts.messages, value.reason)
  pushText(parts.messages, value.detail)
  pushText(parts.types, value.type)
  pushText(parts.types, value.error_type)
  pushText(parts.types, value.errorType)

  if (isRecord(value.error) || Array.isArray(value.error)) {
    collectFalErrorParts(value.error, parts)
  } else {
    pushText(parts.messages, value.error)
  }

  if (isRecord(value.detail) || Array.isArray(value.detail)) {
    collectFalErrorParts(value.detail, parts)
  }

  if (isRecord(value.payload) || Array.isArray(value.payload)) {
    collectFalErrorParts(value.payload, parts)
  }
}

function parseFalJson(errorBody: string): unknown {
  try {
    return JSON.parse(errorBody)
  } catch {
    return null
  }
}

function hasFalBalanceSignal(value: string): boolean {
  return /user\s+is\s+locked|exhausted\s+balance|top\s+up.*balance|billing|payment|insufficient.*(?:balance|credits?)/i.test(
    value,
  )
}

function classifyFalError(
  status: number,
  combinedText: string,
  types: string[],
): GenerationErrorCode {
  const normalizedTypes = new Set(types.map((type) => type.toLowerCase()))

  if (normalizedTypes.has('content_policy_violation')) {
    return GENERATION_ERROR_CODES.CONTENT_FILTERED
  }
  if (normalizedTypes.has('no_media_generated')) {
    return GENERATION_ERROR_CODES.PROVIDER_NO_OUTPUT
  }
  if (
    normalizedTypes.has('image_load_error') ||
    normalizedTypes.has('file_download_error') ||
    normalizedTypes.has('invalid_file_mimetype')
  ) {
    return GENERATION_ERROR_CODES.REFERENCE_IMAGE_UNREACHABLE
  }
  if (hasFalBalanceSignal(combinedText)) {
    return GENERATION_ERROR_CODES.PROVIDER_INSUFFICIENT_BALANCE
  }
  if (status === 401 || status === 403) {
    return GENERATION_ERROR_CODES.INVALID_API_KEY
  }
  if (status === 429) {
    return GENERATION_ERROR_CODES.PROVIDER_RATE_LIMIT
  }
  if (
    status === 408 ||
    status === 504 ||
    /request_timeout|startup_timeout|timeout|timed?\s*out/i.test(combinedText)
  ) {
    return GENERATION_ERROR_CODES.PROVIDER_TIMEOUT
  }
  if (status === 404) {
    return GENERATION_ERROR_CODES.MODEL_UNAVAILABLE
  }
  if (status >= 500) {
    return GENERATION_ERROR_CODES.PROVIDER_OVERLOADED
  }

  return parseGenerationErrorCode(combinedText)
}

function parseFalError(status: number, errorBody: string): FalErrorDetails {
  const parsed = parseFalJson(errorBody)
  const parts: FalErrorParts = { messages: [], types: [] }
  collectFalErrorParts(parsed ?? errorBody, parts)

  const combinedText = [...parts.types, ...parts.messages, errorBody].join(' ')
  const errorCode = classifyFalError(status, combinedText, parts.types)
  const message =
    parts.messages[0] ??
    parts.types[0] ??
    errorBody.slice(0, 200) ??
    `fal.ai request failed with HTTP ${status}`

  return {
    message,
    errorCode,
  }
}

function createFalProviderError(
  status: number,
  errorBody: string,
): ProviderError {
  const parsed = parseFalError(status, errorBody)
  return new ProviderError('fal.ai', status, parsed.message, {
    errorCode: parsed.errorCode,
    message: parsed.message,
  })
}

import {
  ProviderError,
  type HealthCheckInput,
  type ProviderAdapter,
  type ProviderQueueStatusInput,
} from '@/services/providers/types'

const FAL_AUDIO_FILE_SCHEMA = z
  .object({
    url: z.string().url(),
    content_type: z.string().optional().nullable(),
    file_name: z.string().optional().nullable(),
    file_size: z.number().optional().nullable(),
  })
  .passthrough()

const FAL_AUDIO_RESPONSE_SCHEMA = z.object({
  audio_url: FAL_AUDIO_FILE_SCHEMA,
})

const FAL_QUEUE_SUBMIT_SCHEMA = z.object({
  request_id: z.string(),
  status_url: z.string().url(),
  response_url: z.string().url(),
})

// fal occasionally returns status values outside the documented set
// (e.g. ERROR, CANCELED, or future additions). Keep the schema permissive
// so an unknown status surfaces as a clean "failed" rather than a zod
// parse error → 502. fal also routinely sends `null` for optional fields
// (e.g. `logs: null` in IN_QUEUE state), so every field is `nullable()`
// in addition to `optional()` to avoid spurious schema rejections.
const FAL_QUEUE_STATUS_SCHEMA = z
  .object({
    status: z.string(),
    response_url: z.string().url().nullable().optional(),
    logs: z
      .array(
        z
          .object({
            message: z.string().nullable().optional(),
            level: z.string().nullable().optional(),
          })
          .passthrough(),
      )
      .nullable()
      .optional(),
    error: z.unknown().nullable().optional(),
    detail: z.unknown().nullable().optional(),
  })
  .passthrough()

function stringifyFalQueueError(value: unknown): string | undefined {
  if (!value) return undefined
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value !== null) {
    if ('message' in value && typeof value.message === 'string') {
      return value.message
    }
    if ('msg' in value && typeof value.msg === 'string') {
      return value.msg
    }
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function parseFalQueueFailure(
  statusData: z.infer<typeof FAL_QUEUE_STATUS_SCHEMA>,
): FalErrorDetails {
  const fallbackMessage =
    stringifyFalQueueError(statusData.error) ??
    stringifyFalQueueError(statusData.detail) ??
    `Queue request failed with status ${statusData.status}`
  if (statusData.error == null && statusData.detail == null) {
    return {
      message: fallbackMessage,
      errorCode: GENERATION_ERROR_CODES.UNKNOWN,
    }
  }

  const body = JSON.stringify({
    error: statusData.error,
    detail: statusData.detail,
  })
  const parsed = parseFalError(422, body)

  return {
    message: parsed.message || fallbackMessage,
    errorCode: parsed.errorCode,
  }
}

function isFalQueueFailureStatus(status: string): boolean {
  const normalized = status.toUpperCase()
  return (
    normalized === 'FAILED' ||
    normalized === 'ERROR' ||
    normalized === 'CANCELED' ||
    normalized === 'CANCELLED'
  )
}

function inferAudioFormatFromFalFile(file: {
  content_type?: string | null
  file_name?: string | null
}): 'mp3' | 'wav' | 'opus' {
  const contentType = file.content_type?.toLowerCase() ?? ''
  const fileName = file.file_name?.toLowerCase() ?? ''

  if (contentType.includes('wav') || fileName.endsWith('.wav')) return 'wav'
  if (contentType.includes('opus') || fileName.endsWith('.opus')) return 'opus'
  return 'mp3'
}

export const falAdapter: ProviderAdapter = {
  adapterType: AI_ADAPTER_TYPES.FAL,

  async submitAudioToQueue({
    prompt,
    modelId,
    apiKey,
    referenceAudioUrl,
    referenceText,
  }) {
    if (!referenceAudioUrl) {
      throw new ProviderError(
        'fal.ai',
        400,
        'fal.ai F5-TTS requires a reference audio URL.',
      )
    }

    const externalModelId = getExecutionModelId(modelId)
    const endpoint = `${AI_PROVIDER_ENDPOINTS.FAL_QUEUE}/${externalModelId}`
    const body: Record<string, unknown> = {
      gen_text: prompt,
      ref_audio_url: referenceAudioUrl,
      model_type: 'F5-TTS',
      remove_silence: true,
    }

    if (referenceText?.trim()) {
      body.ref_text = referenceText.trim()
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error')
      throw createFalProviderError(response.status, errorBody)
    }

    const data = FAL_QUEUE_SUBMIT_SCHEMA.parse(await response.json())
    return {
      requestId: data.request_id,
      statusUrl: data.status_url,
      responseUrl: data.response_url,
    }
  },

  async checkAudioQueueStatus({
    statusUrl,
    responseUrl,
    apiKey,
  }: ProviderQueueStatusInput) {
    const statusResponse = await fetch(statusUrl, {
      method: 'GET',
      headers: { Authorization: `Key ${apiKey}` },
      signal: AbortSignal.timeout(30_000),
    })

    if (!statusResponse.ok) {
      const errorBody = await statusResponse.text().catch(() => 'Unknown error')
      throw createFalProviderError(statusResponse.status, errorBody)
    }

    const statusData = FAL_QUEUE_STATUS_SCHEMA.parse(
      await statusResponse.json(),
    )

    if (isFalQueueFailureStatus(statusData.status)) {
      const failure = parseFalQueueFailure(statusData)
      return {
        status: 'FAILED' as const,
        error: failure.message,
        errorCode: failure.errorCode,
      }
    }

    if (statusData.status !== 'COMPLETED') {
      return {
        status:
          statusData.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'IN_QUEUE',
      }
    }

    const resultResponse = await fetch(responseUrl, {
      method: 'GET',
      headers: { Authorization: `Key ${apiKey}` },
      signal: AbortSignal.timeout(30_000),
    })

    if (!resultResponse.ok) {
      const errorBody = await resultResponse.text().catch(() => 'Unknown error')
      throw createFalProviderError(resultResponse.status, errorBody)
    }

    const resultData = FAL_AUDIO_RESPONSE_SCHEMA.parse(
      await resultResponse.json(),
    )

    return {
      status: 'COMPLETED' as const,
      result: {
        audioUrl: resultData.audio_url.url,
        duration: 0,
        format: inferAudioFormatFromFalFile(resultData.audio_url),
        sampleRate: 44100,
        requestCount: API_USAGE.DEFAULT_REQUESTS_PER_GENERATION,
      },
    }
  },

  async healthCheck({ modelId, apiKey, baseUrl, timeoutMs }: HealthCheckInput) {
    const start = Date.now()
    try {
      const endpoint = `${baseUrl}/${modelId}`
      const response = await fetch(endpoint, {
        method: 'HEAD',
        headers: { Authorization: `Key ${apiKey}` },
        signal: AbortSignal.timeout(timeoutMs),
      })
      const latencyMs = Date.now() - start
      if (response.ok || response.status === 405 || response.status === 422) {
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

/**
 * Submit a LoRA training job to fal.ai's flux-lora-fast-training.
 * Returns the request_id for status polling.
 */
export async function submitFalLoraTraining(input: {
  apiKey: string
  inputImagesUrl: string
  triggerWord: string
  isStyle: boolean
}): Promise<{ requestId: string; statusUrl: string }> {
  const endpoint = `${AI_PROVIDER_ENDPOINTS.FAL_QUEUE}/fal-ai/flux-lora-fast-training`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Key ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: {
        images_data_url: input.inputImagesUrl,
        trigger_word: input.triggerWord,
        is_style: input.isStyle,
        create_masks: !input.isStyle,
      },
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw createFalProviderError(response.status, errorBody)
  }

  const data = FAL_QUEUE_SUBMIT_SCHEMA.parse(await response.json())
  return { requestId: data.request_id, statusUrl: data.status_url }
}

/**
 * Check status of a fal.ai LoRA training job.
 */
export async function checkFalLoraTrainingStatus(input: {
  apiKey: string
  statusUrl: string
  responseUrl: string
}): Promise<{
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'
  loraUrl: string | null
}> {
  const response = await fetch(input.statusUrl, {
    headers: { Authorization: `Key ${input.apiKey}` },
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw createFalProviderError(response.status, errorBody)
  }

  const data = FAL_QUEUE_STATUS_SCHEMA.parse(await response.json())

  if (data.status === 'COMPLETED') {
    // Fetch the result from response URL
    const resultResponse = await fetch(input.responseUrl, {
      headers: { Authorization: `Key ${input.apiKey}` },
    })
    if (resultResponse.ok) {
      const result = (await resultResponse.json()) as {
        diffusers_lora_file?: { url?: string }
      }
      return {
        status: 'COMPLETED',
        loraUrl: result.diffusers_lora_file?.url ?? null,
      }
    }
  }

  return {
    status: data.status === 'IN_QUEUE' ? 'IN_QUEUE' : 'IN_PROGRESS',
    loraUrl: null,
  }
}
