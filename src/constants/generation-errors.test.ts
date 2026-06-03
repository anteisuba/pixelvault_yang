import { describe, it, expect } from 'vitest'

import {
  GENERATION_ERROR_CODES,
  normalizeErrorCode,
  parseGenerationErrorCode,
} from './generation-errors'

describe('normalizeErrorCode', () => {
  it('maps backend SCREAMING_SNAKE codes to client codes', () => {
    expect(normalizeErrorCode('PROVIDER_TIMEOUT')).toBe(
      GENERATION_ERROR_CODES.PROVIDER_TIMEOUT,
    )
    expect(normalizeErrorCode('RATE_LIMIT_EXCEEDED')).toBe(
      GENERATION_ERROR_CODES.PROVIDER_RATE_LIMIT,
    )
    expect(normalizeErrorCode('SAFETY_FILTER_BLOCKED')).toBe(
      GENERATION_ERROR_CODES.CONTENT_FILTERED,
    )
    expect(normalizeErrorCode('FREE_LIMIT_EXCEEDED')).toBe(
      GENERATION_ERROR_CODES.INSUFFICIENT_CREDITS,
    )
    expect(normalizeErrorCode('INVALID_API_KEY')).toBe(
      GENERATION_ERROR_CODES.INVALID_API_KEY,
    )
    expect(normalizeErrorCode('MISSING_API_KEY')).toBe(
      GENERATION_ERROR_CODES.INVALID_API_KEY,
    )
    expect(normalizeErrorCode('UNSUPPORTED_MODEL')).toBe(
      GENERATION_ERROR_CODES.MODEL_UNAVAILABLE,
    )
  })

  it('passes through codes that are already client codes', () => {
    expect(normalizeErrorCode('provider_timeout')).toBe(
      GENERATION_ERROR_CODES.PROVIDER_TIMEOUT,
    )
    expect(normalizeErrorCode('content_filtered')).toBe(
      GENERATION_ERROR_CODES.CONTENT_FILTERED,
    )
  })

  it('returns null for generic/unmapped codes so message parsing can refine', () => {
    expect(normalizeErrorCode('PROVIDER_ERROR')).toBeNull()
    expect(normalizeErrorCode('VALIDATION_ERROR')).toBeNull()
    expect(normalizeErrorCode('SOMETHING_ELSE')).toBeNull()
  })

  it('returns null for empty input', () => {
    expect(normalizeErrorCode()).toBeNull()
    expect(normalizeErrorCode(undefined)).toBeNull()
    expect(normalizeErrorCode(null)).toBeNull()
    expect(normalizeErrorCode('')).toBeNull()
  })
})

describe('parseGenerationErrorCode', () => {
  it('classifies provider messages by content', () => {
    expect(parseGenerationErrorCode('AI provider timed out')).toBe(
      GENERATION_ERROR_CODES.PROVIDER_TIMEOUT,
    )
    expect(parseGenerationErrorCode('Model is experiencing high demand')).toBe(
      GENERATION_ERROR_CODES.PROVIDER_OVERLOADED,
    )
    expect(parseGenerationErrorCode('rate limit exceeded')).toBe(
      GENERATION_ERROR_CODES.PROVIDER_RATE_LIMIT,
    )
    expect(
      parseGenerationErrorCode('content blocked by the safety system'),
    ).toBe(GENERATION_ERROR_CODES.CONTENT_FILTERED)
  })

  it('returns UNKNOWN for unrecognized text', () => {
    expect(parseGenerationErrorCode('生成失败')).toBe(
      GENERATION_ERROR_CODES.UNKNOWN,
    )
    expect(parseGenerationErrorCode('')).toBe(GENERATION_ERROR_CODES.UNKNOWN)
  })
})
