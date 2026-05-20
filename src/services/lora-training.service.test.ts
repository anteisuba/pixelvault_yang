import { describe, expect, it } from 'vitest'

import {
  LoraTrainingError,
  mapLoraTrainingError,
} from './lora-training.service'

describe('LoraTrainingError', () => {
  it('serializes to a structured wire body via toJSON()', () => {
    const err = new LoraTrainingError(
      'NAMING_CONFLICT',
      'A LoRA named "X" already exists',
      'name',
    )
    const body = err.toJSON()
    expect(body).toMatchObject({
      success: false,
      code: 'NAMING_CONFLICT',
      fieldKey: 'name',
      messageKey: 'errorNamingConflict',
      errorCode: 'LORA_TRAINING_NAMING_CONFLICT',
    })
  })

  it('maps each code to a sensible HTTP status', () => {
    expect(new LoraTrainingError('IMAGE_TOO_LARGE', 'x').httpStatus).toBe(413)
    expect(new LoraTrainingError('NAMING_CONFLICT', 'x').httpStatus).toBe(409)
    expect(new LoraTrainingError('UPSTREAM_TIMEOUT', 'x').httpStatus).toBe(504)
    expect(new LoraTrainingError('RATE_LIMIT', 'x').httpStatus).toBe(429)
    expect(new LoraTrainingError('API_KEY_INVALID', 'x').httpStatus).toBe(401)
  })
})

describe('mapLoraTrainingError', () => {
  it('passes through LoraTrainingError instances unchanged', () => {
    const original = new LoraTrainingError(
      'INSUFFICIENT_CREDITS',
      'Need more credits',
    )
    const mapped = mapLoraTrainingError(original)
    expect(mapped.code).toBe('INSUFFICIENT_CREDITS')
    expect(mapped.messageKey).toBe('errorInsufficientCredits')
  })

  it('maps timeout substrings to UPSTREAM_TIMEOUT', () => {
    expect(
      mapLoraTrainingError(new Error('Civitai request timeout')).code,
    ).toBe('UPSTREAM_TIMEOUT')
    expect(mapLoraTrainingError(new Error('fetch timed out')).code).toBe(
      'UPSTREAM_TIMEOUT',
    )
  })

  it('maps 429 / rate-limit strings to RATE_LIMIT', () => {
    expect(mapLoraTrainingError(new Error('HTTP 429')).code).toBe('RATE_LIMIT')
    expect(mapLoraTrainingError(new Error('Rate Limit exceeded')).code).toBe(
      'RATE_LIMIT',
    )
    expect(mapLoraTrainingError(new Error('429 Too Many Requests')).code).toBe(
      'RATE_LIMIT',
    )
  })

  it('maps 401 / unauthorized strings to API_KEY_INVALID', () => {
    expect(mapLoraTrainingError(new Error('401 Unauthorized')).code).toBe(
      'API_KEY_INVALID',
    )
    expect(mapLoraTrainingError(new Error('Invalid API key')).code).toBe(
      'API_KEY_INVALID',
    )
  })

  it('maps quota strings to QUOTA_EXCEEDED', () => {
    expect(mapLoraTrainingError(new Error('quota exceeded')).code).toBe(
      'QUOTA_EXCEEDED',
    )
    expect(
      mapLoraTrainingError(new Error('insufficient balance on account')).code,
    ).toBe('QUOTA_EXCEEDED')
  })

  it('falls through to INTERNAL for unknown errors', () => {
    expect(mapLoraTrainingError(new Error('some random oops')).code).toBe(
      'INTERNAL',
    )
    expect(mapLoraTrainingError('string error').code).toBe('INTERNAL')
  })

  it('always returns a messageKey that exists for every code', () => {
    const codes = [
      'INSUFFICIENT_CREDITS',
      'IMAGE_TOO_LARGE',
      'BASE_MODEL_UNSUPPORTED',
      'NAMING_CONFLICT',
      'UPSTREAM_TIMEOUT',
      'RATE_LIMIT',
      'QUOTA_EXCEEDED',
      'API_KEY_INVALID',
      'INTERNAL',
    ] as const
    for (const code of codes) {
      const result = mapLoraTrainingError(new LoraTrainingError(code, 'msg'))
      expect(result.messageKey).toMatch(/^error/)
    }
  })
})
