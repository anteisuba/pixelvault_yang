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
  /** 我们的 worker 等满自己的预算先停手；provider 可能还在跑、可能已计费。 */
  GENERATION_WAIT_LIMIT: 'generation_wait_limit',
  /** 同一账号 / key 下排队太久没轮到；这次请求根本没发给 provider，没有扣费。 */
  ACCOUNT_QUEUE_TIMEOUT: 'account_queue_timeout',
  /** Runner 作业等满窗口一直没开始跑（冷启动 / 算力紧张），已撤掉，没出图。 */
  RUNNER_START_TIMEOUT: 'runner_start_timeout',
  /** Runner 作业开始跑了但超出窗口，已撤掉，没出图。 */
  RUNNER_RUN_TIMEOUT: 'runner_run_timeout',
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

/**
 * 跨 step 边界的失败载荷。只用纯数据（V8 可序列化），不带任何原型 —— 原型是
 * 跨不过 Workflows 的 step 边界的。
 */
export interface WorkerStepFailurePayload {
  message: string
  errorCode?: string
  providerMetadata: Record<string, unknown>
}

/**
 * 已经跨过 step 边界、带着完整结构化信息的 provider 失败。由
 * `guardWorkflowStep`（见 `lib/step-failure.ts`）在 `run()` 内部抛出，不跨任何
 * 边界，所以顶层 catch 的 `instanceof` 是可靠的 —— 而 `WorkerProviderError`
 * 的不是。
 */
export class WorkerStepFailure extends Error {
  readonly failure: WorkerStepFailurePayload

  constructor(failure: WorkerStepFailurePayload) {
    super(failure.message)
    this.name = 'WorkerStepFailure'
    this.failure = failure
  }
}

export function toWorkerStepFailurePayload(
  error: WorkerProviderError,
): WorkerStepFailurePayload {
  return {
    message: error.message,
    ...(error.errorCode !== undefined ? { errorCode: error.errorCode } : {}),
    providerMetadata: error.providerMetadata,
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
  if (params.httpStatus === 408 || params.httpStatus === 504) {
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
    params.httpStatus === 503
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

/**
 * 固定英文原话：app 侧 `generation-errors.ts` 的 ERROR_PATTERNS 靠它在 errorCode
 * 丢失时兜底认出来（排在通用 /timed?\s*out/ 之前）。⚠ 改措辞要同步那两条规则。
 */
export const GENERATION_WAIT_LIMIT_MESSAGE_PREFIX =
  'Generation wait limit reached'
export const ACCOUNT_QUEUE_TIMEOUT_MESSAGE =
  'Account queue wait limit reached: too many generations were already running on this account, so this one was never sent to the provider.'

/**
 * **我们自己**的轮询预算用完了（不是 provider 报超时）：provider 那边的任务可能还在跑、
 * 也可能已经计费。显示给用户的文案按 errorCode 取，这里的英文只进日志 / 详情。
 */
export function createGenerationWaitLimitError(input: {
  provider: string
  phase: string
  requestId?: string
  providerMetadata?: Record<string, unknown>
}): WorkerProviderError {
  return new WorkerProviderError({
    message: `${GENERATION_WAIT_LIMIT_MESSAGE_PREFIX}: ANTEI stopped waiting for ${input.provider}; the provider may still be processing this job.`,
    provider: input.provider,
    phase: input.phase,
    errorCode: WORKER_GENERATION_ERROR_CODES.GENERATION_WAIT_LIMIT,
    requestId: input.requestId,
    providerMetadata: input.providerMetadata,
  })
}

/**
 * `AbortSignal.timeout()` 触发的 `TimeoutError` 是**我们**给这次请求设的上限到了，
 * provider 并没有说超时 —— 转成 wait-limit；其它错误原样返回给调用方去 throw。
 */
export function asWaitLimitIfAbortTimeout(
  error: unknown,
  input: { provider: string; phase: string },
): unknown {
  return error instanceof Error && error.name === 'TimeoutError'
    ? createGenerationWaitLimitError(input)
    : error
}

/** 固定英文原话：app 侧 ERROR_PATTERNS 靠它在 errorCode 丢失时兜底认出（排在通用 timeout 之前）。 */
export const RUNNER_START_TIMEOUT_MESSAGE =
  'Runner job never started: it stayed queued for the whole wait window (cold start or no free GPU), so it was canceled.'
export const RUNNER_RUN_TIMEOUT_MESSAGE =
  'Runner job ran past the wait window after starting, so it was canceled.'

/**
 * Runner 轮询窗口用完、作业已被撤掉（`cancelOnTimeout`）：分「一直没开始」和「开始了但太久」。
 * 和 `generation_wait_limit` 不同 —— 这里不会有迟到的结果，用户不用去素材库找。
 */
export function createRunnerTimeoutError(input: {
  provider: string
  requestId?: string
  started: boolean
}): WorkerProviderError {
  return new WorkerProviderError({
    message: input.started
      ? RUNNER_RUN_TIMEOUT_MESSAGE
      : RUNNER_START_TIMEOUT_MESSAGE,
    provider: input.provider,
    phase: 'status_poll',
    errorCode: input.started
      ? WORKER_GENERATION_ERROR_CODES.RUNNER_RUN_TIMEOUT
      : WORKER_GENERATION_ERROR_CODES.RUNNER_START_TIMEOUT,
    requestId: input.requestId,
  })
}

/** 按账号排队等满了：请求从没发给 provider，没有扣费。 */
export function createAccountQueueTimeoutError(input: {
  provider: string
  phase: string
}): WorkerProviderError {
  return new WorkerProviderError({
    message: ACCOUNT_QUEUE_TIMEOUT_MESSAGE,
    provider: input.provider,
    phase: input.phase,
    errorCode: WORKER_GENERATION_ERROR_CODES.ACCOUNT_QUEUE_TIMEOUT,
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
  // 从 step 边界里活着带出来的失败（见 lib/step-failure.ts）。workflow 顶层
  // catch 里的 provider 失败**都**走这条 —— `WorkerProviderError` 本身跨不过
  // step 边界，它的 instanceof 在那里永远是 false。
  if (error instanceof WorkerStepFailure) {
    return {
      error: error.failure.message,
      errorCode: error.failure.errorCode,
      providerMetadata: {
        ...(fallback.providerMetadata ?? {}),
        ...error.failure.providerMetadata,
      },
    }
  }

  // 没跨过 step 边界就抛到这里的（例如直接在 run() 里构造的）仍然原样可用。
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
