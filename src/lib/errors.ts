/**
 * Unified error hierarchy for all generation-related operations.
 *
 * Every error carries: errorCode (machine-readable), httpStatus, i18nKey (for client translation).
 * These classes are SERVER-ONLY — clients receive plain JSON: { errorCode, error, i18nKey }.
 */

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

export class ValidationError extends GenerationError {
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
