const ERROR_BODY_EXCERPT_LENGTH = 1000

export const WORKER_GENERATION_ERROR_CODES = {
  PROVIDER_TIMEOUT: 'provider_timeout',
  PROVIDER_RATE_LIMIT: 'provider_rate_limit',
  PROVIDER_OVERLOADED: 'provider_overloaded',
  INVALID_API_KEY: 'invalid_api_key',
  CONTENT_FILTERED: 'content_filtered',
  MODEL_UNAVAILABLE: 'model_unavailable',
  PROVIDER_NO_OUTPUT: 'provider_no_output',
  PROVIDER_INSUFFICIENT_BALANCE: 'provider_insufficient_balance',
  REFERENCE_IMAGE_UNREACHABLE: 'reference_image_unreachable',
  UNKNOWN: 'unknown',
} as const

export type WorkerGenerationErrorCode =
  (typeof WORKER_GENERATION_ERROR_CODES)[keyof typeof WORKER_GENERATION_ERROR_CODES]

export interface WorkerProviderErrorInput {
  message: string
  provider: string
  phase: string
  errorCode?: string
  httpStatus?: number
  errorType?: string
  requestId?: string
  bodyExcerpt?: string
  providerMetadata?: Record<string, unknown>
}

export class WorkerProviderError extends Error {
  readonly errorCode?: string
  readonly providerMetadata: Record<string, unknown>

  constructor(input: WorkerProviderErrorInput) {
    super(input.message)
    this.name = 'WorkerProviderError'
    this.errorCode = input.errorCode
    this.providerMetadata = {
      provider: input.provider,
      phase: input.phase,
      ...(input.httpStatus !== undefined
        ? { httpStatus: input.httpStatus }
        : {}),
      ...(input.errorType ? { errorType: input.errorType } : {}),
      ...(input.requestId ? { requestId: input.requestId } : {}),
      ...(input.bodyExcerpt ? { bodyExcerpt: input.bodyExcerpt } : {}),
      ...(input.providerMetadata ?? {}),
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readStringField(
  value: Record<string, unknown>,
  key: string,
): string | null {
  const fieldValue = value[key]
  return typeof fieldValue === 'string' && fieldValue.trim() ? fieldValue : null
}

function parseJsonBody(text: string): unknown {
  if (!text.trim()) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function stringifyErrorValue(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value
  if (isRecord(value)) return extractProviderMessage(value)
  return null
}

function extractDetailMessage(detail: unknown): string | null {
  if (typeof detail === 'string' && detail.trim()) return detail
  if (!Array.isArray(detail)) return null

  const parts = detail
    .map((item) => {
      if (typeof item === 'string') return item
      if (!isRecord(item)) return null
      const message =
        readStringField(item, 'msg') ??
        readStringField(item, 'message') ??
        readStringField(item, 'error')
      const type =
        readStringField(item, 'type') ?? readStringField(item, 'error_type')
      if (message && type) return `${type}: ${message}`
      return message ?? type
    })
    .filter((item): item is string => Boolean(item))

  return parts.length > 0 ? parts.join('; ') : null
}

function extractProviderMessage(
  payload: Record<string, unknown>,
): string | null {
  const direct =
    stringifyErrorValue(payload.error) ??
    readStringField(payload, 'message') ??
    readStringField(payload, 'msg') ??
    extractDetailMessage(payload.detail)
  if (direct) return direct

  if (isRecord(payload.payload)) {
    const nested = extractProviderMessage(payload.payload)
    if (nested) return nested
  }

  if (isRecord(payload.error_payload)) {
    const nested = extractProviderMessage(payload.error_payload)
    if (nested) return nested
  }

  return null
}

function extractErrorType(payload: Record<string, unknown>): string | null {
  return (
    readStringField(payload, 'error_type') ??
    readStringField(payload, 'type') ??
    readStringField(payload, 'code') ??
    readStringField(payload, 'failureCode') ??
    readStringField(payload, 'finishReason') ??
    readStringField(payload, 'blockReason')
  )
}

function hasProviderFailureMarker(payload: Record<string, unknown>): boolean {
  const status = readStringField(payload, 'status')?.toUpperCase()
  const hasFailureValue = (key: string): boolean => {
    const value = payload[key]
    return (
      value !== null &&
      value !== undefined &&
      (typeof value !== 'string' || value.trim().length > 0)
    )
  }

  return (
    status === 'FAILED' ||
    status === 'ERROR' ||
    status === 'CANCELED' ||
    status === 'CANCELLED' ||
    hasFailureValue('error') ||
    hasFailureValue('error_type') ||
    hasFailureValue('failureCode') ||
    hasFailureValue('blockReason')
  )
}

function classifyProviderFailure(params: {
  message: string
  errorType?: string
  httpStatus?: number
}): WorkerGenerationErrorCode {
  const joined = `${params.errorType ?? ''} ${params.message}`.toLowerCase()
  const hasBalanceSignal =
    /balance|billing|payment|insufficient.*credit|quota|user is locked|account.*locked/.test(
      joined,
    )

  if (params.httpStatus === 403 && hasBalanceSignal) {
    return WORKER_GENERATION_ERROR_CODES.PROVIDER_INSUFFICIENT_BALANCE
  }
  if (params.httpStatus === 401 || params.httpStatus === 403) {
    return WORKER_GENERATION_ERROR_CODES.INVALID_API_KEY
  }
  if (params.httpStatus === 402) {
    return WORKER_GENERATION_ERROR_CODES.PROVIDER_INSUFFICIENT_BALANCE
  }
  if (params.httpStatus === 408) {
    return WORKER_GENERATION_ERROR_CODES.PROVIDER_TIMEOUT
  }
  if (params.httpStatus === 429) {
    if (hasBalanceSignal) {
      return WORKER_GENERATION_ERROR_CODES.PROVIDER_INSUFFICIENT_BALANCE
    }
    return WORKER_GENERATION_ERROR_CODES.PROVIDER_RATE_LIMIT
  }
  if (
    params.httpStatus === 500 ||
    params.httpStatus === 502 ||
    params.httpStatus === 503 ||
    params.httpStatus === 504
  ) {
    return WORKER_GENERATION_ERROR_CODES.PROVIDER_OVERLOADED
  }
  if (
    /content[_\s-]?policy|safety|moderation|blocked|prohibited|nsfw/.test(
      joined,
    )
  ) {
    return WORKER_GENERATION_ERROR_CODES.CONTENT_FILTERED
  }
  if (
    /no[_\s-]?media|no[_\s-]?image|no output|did not include|empty output/.test(
      joined,
    )
  ) {
    return WORKER_GENERATION_ERROR_CODES.PROVIDER_NO_OUTPUT
  }
  if (/download|fetch|load.*image|image_load|file_download/.test(joined)) {
    return WORKER_GENERATION_ERROR_CODES.REFERENCE_IMAGE_UNREACHABLE
  }
  if (/timeout|timed out/.test(joined)) {
    return WORKER_GENERATION_ERROR_CODES.PROVIDER_TIMEOUT
  }
  if (/rate limit|too many requests/.test(joined)) {
    return WORKER_GENERATION_ERROR_CODES.PROVIDER_RATE_LIMIT
  }
  if (/balance|billing|payment|insufficient.*credit|quota/.test(joined)) {
    return WORKER_GENERATION_ERROR_CODES.PROVIDER_INSUFFICIENT_BALANCE
  }
  if (/model.*unavailable|not found/.test(joined)) {
    return WORKER_GENERATION_ERROR_CODES.MODEL_UNAVAILABLE
  }

  return WORKER_GENERATION_ERROR_CODES.UNKNOWN
}

export function createProviderPayloadError(
  payload: unknown,
  input: {
    provider: string
    phase: string
    fallbackMessage: string
    requestId?: string
    force?: boolean
    providerMetadata?: Record<string, unknown>
  },
): WorkerProviderError | null {
  if (!isRecord(payload)) return null
  if (!input.force && !hasProviderFailureMarker(payload)) return null

  const errorType = extractErrorType(payload) ?? undefined
  const message = extractProviderMessage(payload) ?? input.fallbackMessage
  const errorCode = classifyProviderFailure({ message, errorType })

  return new WorkerProviderError({
    message,
    provider: input.provider,
    phase: input.phase,
    errorCode,
    errorType,
    requestId: input.requestId,
    providerMetadata: input.providerMetadata,
  })
}

export async function createProviderResponseError(
  response: Response,
  input: {
    provider: string
    phase: string
    fallbackMessage: string
    requestId?: string
    providerMetadata?: Record<string, unknown>
  },
): Promise<WorkerProviderError> {
  const bodyText = await response.text().catch(() => '')
  const payload = parseJsonBody(bodyText)
  const bodyExcerpt = bodyText
    ? bodyText.slice(0, ERROR_BODY_EXCERPT_LENGTH)
    : undefined
  const payloadError = createProviderPayloadError(payload, {
    provider: input.provider,
    phase: input.phase,
    fallbackMessage: input.fallbackMessage,
    requestId: input.requestId,
    force: true,
    providerMetadata: input.providerMetadata,
  })

  if (payloadError) {
    return new WorkerProviderError({
      message: payloadError.message,
      provider: input.provider,
      phase: input.phase,
      errorCode: classifyProviderFailure({
        message: payloadError.message,
        errorType:
          typeof payloadError.providerMetadata.errorType === 'string'
            ? payloadError.providerMetadata.errorType
            : undefined,
        httpStatus: response.status,
      }),
      httpStatus: response.status,
      errorType:
        typeof payloadError.providerMetadata.errorType === 'string'
          ? payloadError.providerMetadata.errorType
          : undefined,
      requestId: input.requestId,
      bodyExcerpt,
      providerMetadata: input.providerMetadata,
    })
  }

  return new WorkerProviderError({
    message: input.fallbackMessage,
    provider: input.provider,
    phase: input.phase,
    errorCode: classifyProviderFailure({
      message: input.fallbackMessage,
      httpStatus: response.status,
    }),
    httpStatus: response.status,
    requestId: input.requestId,
    bodyExcerpt,
    providerMetadata: input.providerMetadata,
  })
}

export function createProviderNoOutputError(input: {
  provider: string
  phase: string
  message: string
  requestId?: string
  providerMetadata?: Record<string, unknown>
}): WorkerProviderError {
  return new WorkerProviderError({
    message: input.message,
    provider: input.provider,
    phase: input.phase,
    errorCode: WORKER_GENERATION_ERROR_CODES.PROVIDER_NO_OUTPUT,
    requestId: input.requestId,
    providerMetadata: input.providerMetadata,
  })
}

export function createGeminiNoImageError(
  payload: unknown,
): WorkerProviderError {
  const providerMetadata: Record<string, unknown> = {}
  let message = 'Gemini response did not include inline image data.'
  let errorCode: WorkerGenerationErrorCode =
    WORKER_GENERATION_ERROR_CODES.PROVIDER_NO_OUTPUT

  if (isRecord(payload)) {
    const promptFeedback = isRecord(payload.promptFeedback)
      ? payload.promptFeedback
      : null
    const blockReason = promptFeedback
      ? readStringField(promptFeedback, 'blockReason')
      : null
    if (blockReason) {
      providerMetadata.blockReason = blockReason
      message = `Gemini blocked the prompt: ${blockReason}`
      errorCode = WORKER_GENERATION_ERROR_CODES.CONTENT_FILTERED
    }

    const candidates = Array.isArray(payload.candidates)
      ? payload.candidates
      : []
    const firstCandidate = candidates.find(isRecord)
    if (firstCandidate) {
      const finishReason = readStringField(firstCandidate, 'finishReason')
      const finishMessage = readStringField(firstCandidate, 'finishMessage')
      if (finishReason) providerMetadata.finishReason = finishReason
      if (finishMessage) providerMetadata.finishMessage = finishMessage
      if (
        finishReason &&
        /safety|prohibited|blocklist|recitation|spi/i.test(finishReason)
      ) {
        message = finishMessage ?? `Gemini blocked the output: ${finishReason}`
        errorCode = WORKER_GENERATION_ERROR_CODES.CONTENT_FILTERED
      } else if (finishReason) {
        message = finishMessage ?? `Gemini returned no image: ${finishReason}`
      }
    }
  }

  return new WorkerProviderError({
    message,
    provider: 'gemini',
    phase: 'generate_image',
    errorCode,
    providerMetadata,
  })
}

export function buildWorkerFailureCallbackData(
  error: unknown,
  fallback: {
    message: string
    providerMetadata?: Record<string, unknown>
  },
): {
  error: string
  errorCode?: string
  providerMetadata?: Record<string, unknown>
} {
  if (error instanceof WorkerProviderError) {
    return {
      error: error.message,
      errorCode: error.errorCode,
      providerMetadata: {
        ...(fallback.providerMetadata ?? {}),
        ...error.providerMetadata,
      },
    }
  }

  return {
    error: error instanceof Error ? error.message : fallback.message,
    providerMetadata: fallback.providerMetadata,
  }
}
