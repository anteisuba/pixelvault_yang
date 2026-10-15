/**
 * Unified error hierarchy for JSON API operations.
 *
 * Every error carries: errorCode (machine-readable), httpStatus, i18nKey (for client translation).
 * These classes are SERVER-ONLY — clients receive plain JSON: { errorCode, error, i18nKey }.
 */

import {
  ASSISTANT_MODEL_CANNOT_SEE_CODE,
  ASSISTANT_OPERATOR_MODEL_KEY_MISSING_CODE,
} from '@/constants/assistant-operator'
import type { AI_ADAPTER_TYPES } from '@/constants/providers'

// ─── Base Class ──────────────────────────────────────────────────

export abstract class GenerationError extends Error {
  abstract readonly errorCode: string
  abstract readonly httpStatus: number
  abstract readonly i18nKey: string

  constructor(message: string) {
    super(message)
    this.name = this.constructor.name
  }

  /** Serialize for HTTP response (plain object, no class references) */
  toJSON() {
    return {
      success: false as const,
      error: this.message,
      errorCode: this.errorCode,
      i18nKey: this.i18nKey,
    }
  }
}

export class ApiRequestError extends GenerationError {
  readonly errorCode: string
  readonly httpStatus: number
  readonly i18nKey: string

  constructor(
    errorCode: string,
    httpStatus: number,
    i18nKey: string,
    message: string,
  ) {
    super(message)
    this.errorCode = errorCode
    this.httpStatus = httpStatus
    this.i18nKey = i18nKey
  }
}

/**
 * Explicitly safe transient provider message for legacy call sites that have
 * not yet migrated to ApiRequestError. Never construct this from a raw
 * upstream response; callers must provide controlled copy.
 */
export class ProviderTransientError extends Error {
  readonly errorCode = 'PROVIDER_TRANSIENT' as const

  constructor(publicMessage: string) {
    super(publicMessage)
    this.name = 'ProviderTransientError'
  }
}

// ─── Concrete Error Types ────────────────────────────────────────

export class ProviderError extends GenerationError {
  readonly httpStatus: number
  readonly i18nKey: string
  readonly errorCode: string
  readonly provider: string

  constructor(
    provider: string,
    message: string,
    options?: { timeout?: boolean; status?: number },
  ) {
    super(message)
    this.provider = provider
    this.errorCode = options?.timeout ? 'PROVIDER_TIMEOUT' : 'PROVIDER_ERROR'
    this.httpStatus = options?.timeout ? 504 : (options?.status ?? 502)
    this.i18nKey = options?.timeout
      ? 'errors.provider.timeout'
      : 'errors.provider.failed'
  }
}

export class GenerationValidationError extends GenerationError {
  readonly errorCode = 'VALIDATION_ERROR' as const
  readonly httpStatus = 400
  readonly i18nKey = 'errors.validation.invalidInput' as const
  readonly fieldErrors: Array<{ field: string; message: string }>

  constructor(
    fieldErrors: Array<{ field: string; message: string }>,
    message?: string,
  ) {
    super(message ?? fieldErrors.map((e) => e.message).join(', '))
    this.fieldErrors = fieldErrors
  }
}

export class RateLimitError extends GenerationError {
  readonly errorCode = 'RATE_LIMIT_EXCEEDED' as const
  readonly httpStatus = 429
  readonly i18nKey = 'errors.rateLimit' as const
  readonly retryAfterSeconds: number
  readonly limit: number

  constructor(limit: number, windowSeconds: number) {
    super('Too many requests. Please wait a moment.')
    this.retryAfterSeconds = windowSeconds
    this.limit = limit
  }
}

export class AuthError extends GenerationError {
  readonly errorCode = 'UNAUTHORIZED' as const
  readonly httpStatus = 401
  readonly i18nKey = 'errors.auth.unauthorized' as const

  constructor(message = 'Unauthorized') {
    super(message)
  }
}

export class InsufficientCreditsError extends GenerationError {
  readonly errorCode = 'FREE_LIMIT_EXCEEDED' as const
  readonly httpStatus = 403
  readonly i18nKey = 'errors.credits.exceeded' as const

  constructor(message = 'Free generation limit exceeded') {
    super(message)
  }
}

export class ApiKeyError extends GenerationError {
  readonly errorCode: string
  readonly httpStatus = 400
  readonly i18nKey: string

  constructor(type: 'missing' | 'invalid', message?: string) {
    super(
      message ??
        (type === 'missing'
          ? 'API key is required for this model'
          : 'Invalid API key'),
    )
    this.errorCode = type === 'missing' ? 'MISSING_API_KEY' : 'INVALID_API_KEY'
    this.i18nKey =
      type === 'missing' ? 'errors.apiKey.missing' : 'errors.apiKey.invalid'
  }
}

/**
 * The assistant model the user picked has no active key for its provider.
 *
 * ⛔ Never run the turn on another provider's key in its place (owner 2026-10-15:
 * 「会自动扣其他模型的token，用户还不知道」). The error carries the provider and model
 * so the client opens `QuickSetupDialog` for exactly that provider (Hard Rule 8).
 */
export class AssistantModelKeyMissingError extends GenerationError {
  readonly errorCode = ASSISTANT_OPERATOR_MODEL_KEY_MISSING_CODE
  readonly httpStatus = 400
  readonly i18nKey = 'errors.assistant.modelKeyMissing' as const
  readonly adapterType: AI_ADAPTER_TYPES
  readonly modelId: string

  constructor(adapterType: AI_ADAPTER_TYPES, modelId: string) {
    super(
      `The assistant model ${modelId} has no active ${adapterType} key. Nothing ran; no other provider was used in its place.`,
    )
    this.adapterType = adapterType
    this.modelId = modelId
  }

  /** JSON 接口也带上哪一家、哪个型号：界面据它就地开**那一家**的配置弹窗（「满意」评估等）。 */
  override toJSON() {
    return {
      ...super.toJSON(),
      missingKey: { adapterType: this.adapterType, modelId: this.modelId },
    }
  }
}

/**
 * The assistant's model (the one the creator picked, or the one "auto" picked) cannot look
 * at pictures, and this job needs to (owner 2026-10-15: say it plainly, never borrow another
 * provider's key that can see).
 */
export class AssistantModelCannotSeeError extends GenerationError {
  readonly errorCode = ASSISTANT_MODEL_CANNOT_SEE_CODE
  readonly httpStatus = 400
  readonly i18nKey = 'errors.assistant.modelCannotSee' as const
  readonly adapterType: AI_ADAPTER_TYPES
  readonly modelId: string

  constructor(adapterType: AI_ADAPTER_TYPES, modelId: string) {
    super(
      `The assistant model ${modelId} cannot look at pictures, so nothing was sent; no other provider was used in its place.`,
    )
    this.adapterType = adapterType
    this.modelId = modelId
  }
}

export class NotImplementedError extends GenerationError {
  readonly errorCode = 'NOT_IMPLEMENTED' as const
  readonly httpStatus = 501
  readonly i18nKey = 'Errors.notImplemented' as const

  constructor(feature: string) {
    super(`${feature} is not yet implemented`)
  }
}

/**
 * Thrown when a generative provider's content-moderation layer refuses the
 * request — distinct from a generic ProviderError because it's caused by the
 * input (image or prompt), not by an outage. OpenAI's gpt-image-* is famously
 * aggressive here, especially on anime / character / face content; Gemini
 * also occasionally returns SAFETY finishReason. We surface a dedicated code
 * so the client can suggest switching providers rather than telling the user
 * to "try again".
 */
export class SafetyFilterError extends GenerationError {
  readonly errorCode = 'SAFETY_FILTER_BLOCKED' as const
  readonly httpStatus = 422
  readonly i18nKey = 'errors.provider.safetyBlocked' as const
  readonly provider: string

  constructor(provider: string, detail?: string) {
    super(
      detail ??
        `${provider} refused to process the request due to its content safety policy.`,
    )
    this.provider = provider
  }
}

// ─── Type Guard ──────────────────────────────────────────────────

export function isGenerationError(error: unknown): error is GenerationError {
  return error instanceof GenerationError
}

// ─── Legacy Compatibility ────────────────────────────────────────
// Maps legacy GenerateImageServiceErrorCode to new error classes.
// Remove after all routes are migrated to createApiRoute.

export type LegacyErrorCode =
  | 'FREE_LIMIT_EXCEEDED'
  | 'INVALID_JOB'
  | 'INVALID_ROUTE_SELECTION'
  | 'JOB_NOT_FOUND'
  | 'MISSING_API_KEY'
  | 'NOVELAI_TIER_LIMIT'
  | 'PLATFORM_KEY_MISSING'
  | 'PROVIDER_ERROR'
  | 'UNSUPPORTED_MODEL'
  | 'USER_NOT_FOUND'
