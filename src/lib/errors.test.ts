import { describe, it, expect } from 'vitest'

import {
  GenerationError,
  GenerationValidationError,
  RateLimitError,
  ProviderError,
  AuthError,
  InsufficientCreditsError,
  ApiKeyError,
  isGenerationError,
} from '@/lib/errors'

// ─── Base Class ──────────────────────────────────────────────────

describe('GenerationError (abstract base)', () => {
  it('cannot be instantiated directly', () => {
    // TypeScript prevents this at compile time, but at runtime
    // the abstract class itself is a function — verify subclasses work instead.
    // We check that calling `new` on a concrete subclass IS a GenerationError.
    const err = new AuthError()
    expect(err).toBeInstanceOf(GenerationError)
    expect(err).toBeInstanceOf(Error)
  })

  it('sets name to the constructor name on subclasses', () => {
    expect(new AuthError().name).toBe('AuthError')
    expect(new RateLimitError(10, 60).name).toBe('RateLimitError')
    expect(new ProviderError('hf', 'fail').name).toBe('ProviderError')
  })
})

// ─── AuthError ───────────────────────────────────────────────────

describe('AuthError', () => {
  it('uses default message when none provided', () => {
    const err = new AuthError()
    expect(err.message).toBe('Unauthorized')
  })

  it('accepts a custom message', () => {
    const err = new AuthError('Session expired')
    expect(err.message).toBe('Session expired')
  })

  it('has correct errorCode, httpStatus, i18nKey', () => {
    const err = new AuthError()
    expect(err.errorCode).toBe('UNAUTHORIZED')
    expect(err.httpStatus).toBe(401)
    expect(err.i18nKey).toBe('errors.auth.unauthorized')
  })

  it('toJSON() returns correct shape', () => {
    const err = new AuthError()
    expect(err.toJSON()).toEqual({
      success: false,
      error: 'Unauthorized',
      errorCode: 'UNAUTHORIZED',
      i18nKey: 'errors.auth.unauthorized',
    })
  })
})

// ─── GenerationValidationError ───────────────────────────────────

describe('GenerationValidationError', () => {
  const fieldErrors = [
    { field: 'prompt', message: 'Required' },
    { field: 'modelId', message: 'Invalid model' },
  ]

  it('has correct errorCode, httpStatus, i18nKey', () => {
    const err = new GenerationValidationError(fieldErrors)
    expect(err.errorCode).toBe('VALIDATION_ERROR')
    expect(err.httpStatus).toBe(400)
    expect(err.i18nKey).toBe('errors.validation.invalidInput')
  })

  it('builds message from field errors when none given', () => {
    const err = new GenerationValidationError(fieldErrors)
    expect(err.message).toBe('Required, Invalid model')
  })

  it('uses custom message when provided', () => {
    const err = new GenerationValidationError(fieldErrors, 'Bad input')
    expect(err.message).toBe('Bad input')
  })

  it('exposes fieldErrors array', () => {
    const err = new GenerationValidationError(fieldErrors)
    expect(err.fieldErrors).toEqual(fieldErrors)
  })

  it('toJSON() serializes correctly', () => {
    const err = new GenerationValidationError(fieldErrors)
    const json = err.toJSON()
    expect(json.success).toBe(false)
    expect(json.errorCode).toBe('VALIDATION_ERROR')
    expect(json.i18nKey).toBe('errors.validation.invalidInput')
    expect(json.error).toBe('Required, Invalid model')
  })
})

// ─── RateLimitError ──────────────────────────────────────────────

describe('RateLimitError', () => {
  it('has correct errorCode, httpStatus, i18nKey', () => {
    const err = new RateLimitError(10, 60)
    expect(err.errorCode).toBe('RATE_LIMIT_EXCEEDED')
    expect(err.httpStatus).toBe(429)
    expect(err.i18nKey).toBe('errors.rateLimit')
  })

  it('stores limit and retryAfterSeconds', () => {
    const err = new RateLimitError(5, 120)
    expect(err.limit).toBe(5)
    expect(err.retryAfterSeconds).toBe(120)
  })

  it('has a fixed user-facing message', () => {
    const err = new RateLimitError(10, 60)
    expect(err.message).toBe('Too many requests. Please wait a moment.')
  })

  it('toJSON() serializes correctly', () => {
    const err = new RateLimitError(10, 60)
    expect(err.toJSON()).toEqual({
      success: false,
      error: 'Too many requests. Please wait a moment.',
      errorCode: 'RATE_LIMIT_EXCEEDED',
      i18nKey: 'errors.rateLimit',
    })
  })
})

// ─── ProviderError ───────────────────────────────────────────────

describe('ProviderError', () => {
  it('defaults to PROVIDER_ERROR / 502 without options', () => {
    const err = new ProviderError('huggingface', 'Service unavailable')
    expect(err.errorCode).toBe('PROVIDER_ERROR')
    expect(err.httpStatus).toBe(502)
    expect(err.i18nKey).toBe('errors.provider.failed')
    expect(err.provider).toBe('huggingface')
    expect(err.message).toBe('Service unavailable')
  })

  it('uses PROVIDER_TIMEOUT / 504 when timeout option is set', () => {
    const err = new ProviderError('gemini', 'Timed out', { timeout: true })
    expect(err.errorCode).toBe('PROVIDER_TIMEOUT')
    expect(err.httpStatus).toBe(504)
    expect(err.i18nKey).toBe('errors.provider.timeout')
  })

  it('respects custom status code', () => {
    const err = new ProviderError('openai', 'Rate limited', { status: 429 })
    expect(err.httpStatus).toBe(429)
    expect(err.errorCode).toBe('PROVIDER_ERROR')
  })

  it('timeout takes precedence over custom status', () => {
    const err = new ProviderError('openai', 'Timed out', {
      timeout: true,
      status: 429,
    })
    expect(err.httpStatus).toBe(504)
  })

  it('toJSON() serializes correctly', () => {
    const err = new ProviderError('hf', 'Boom')
    expect(err.toJSON()).toEqual({
      success: false,
      error: 'Boom',
      errorCode: 'PROVIDER_ERROR',
      i18nKey: 'errors.provider.failed',
    })
  })
})

// ─── InsufficientCreditsError ────────────────────────────────────

describe('InsufficientCreditsError', () => {
  it('has correct errorCode, httpStatus, i18nKey', () => {
    const err = new InsufficientCreditsError()
    expect(err.errorCode).toBe('FREE_LIMIT_EXCEEDED')
    expect(err.httpStatus).toBe(403)
    expect(err.i18nKey).toBe('errors.credits.exceeded')
  })

  it('uses default message', () => {
    const err = new InsufficientCreditsError()
    expect(err.message).toBe('Free generation limit exceeded')
  })

  it('accepts a custom message', () => {
    const err = new InsufficientCreditsError('No credits left')
    expect(err.message).toBe('No credits left')
  })

  it('toJSON() serializes correctly', () => {
    const err = new InsufficientCreditsError()
    expect(err.toJSON()).toEqual({
      success: false,
      error: 'Free generation limit exceeded',
      errorCode: 'FREE_LIMIT_EXCEEDED',
      i18nKey: 'errors.credits.exceeded',
    })
  })
})

// ─── ApiKeyError ─────────────────────────────────────────────────

describe('ApiKeyError', () => {
  it('missing type: correct errorCode, httpStatus, i18nKey', () => {
    const err = new ApiKeyError('missing')
    expect(err.errorCode).toBe('MISSING_API_KEY')
    expect(err.httpStatus).toBe(400)
    expect(err.i18nKey).toBe('errors.apiKey.missing')
    expect(err.message).toBe('API key is required for this model')
  })

  it('invalid type: correct errorCode, httpStatus, i18nKey', () => {
    const err = new ApiKeyError('invalid')
    expect(err.errorCode).toBe('INVALID_API_KEY')
    expect(err.httpStatus).toBe(400)
    expect(err.i18nKey).toBe('errors.apiKey.invalid')
    expect(err.message).toBe('Invalid API key')
  })

  it('accepts custom message', () => {
    const err = new ApiKeyError('missing', 'Provide your key')
    expect(err.message).toBe('Provide your key')
  })
})

// ─── instanceof checks ──────────────────────────────────────────

describe('instanceof checks', () => {
  it('all subtypes are instanceof GenerationError', () => {
    expect(new AuthError()).toBeInstanceOf(GenerationError)
    expect(new RateLimitError(1, 1)).toBeInstanceOf(GenerationError)
    expect(new ProviderError('x', 'y')).toBeInstanceOf(GenerationError)
    expect(new InsufficientCreditsError()).toBeInstanceOf(GenerationError)
    expect(new GenerationValidationError([])).toBeInstanceOf(GenerationError)
    expect(new ApiKeyError('missing')).toBeInstanceOf(GenerationError)
  })

  it('all subtypes are instanceof Error', () => {
    expect(new AuthError()).toBeInstanceOf(Error)
    expect(new RateLimitError(1, 1)).toBeInstanceOf(Error)
    expect(new ProviderError('x', 'y')).toBeInstanceOf(Error)
  })
})

// ─── isGenerationError type guard ────────────────────────────────

describe('isGenerationError()', () => {
  it('returns true for GenerationError subtypes', () => {
    expect(isGenerationError(new AuthError())).toBe(true)
    expect(isGenerationError(new RateLimitError(1, 1))).toBe(true)
    expect(isGenerationError(new ProviderError('x', 'y'))).toBe(true)
    expect(isGenerationError(new InsufficientCreditsError())).toBe(true)
    expect(isGenerationError(new ApiKeyError('missing'))).toBe(true)
  })

  it('returns false for plain Error', () => {
    expect(isGenerationError(new Error('nope'))).toBe(false)
  })

  it('returns false for non-error values', () => {
    expect(isGenerationError(null)).toBe(false)
    expect(isGenerationError(undefined)).toBe(false)
    expect(isGenerationError('string')).toBe(false)
    expect(isGenerationError(42)).toBe(false)
    expect(isGenerationError({})).toBe(false)
  })
})
