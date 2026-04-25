import { describe, it, expect, vi } from 'vitest'
import { createHmac } from 'node:crypto'

// Set secret before importing module under test.
const TEST_SECRET = 'test-secret-32-characters-minimum'

vi.stubEnv('INTERNAL_CALLBACK_SECRET', TEST_SECRET)

import {
  verifyInternalExecutionSignature,
  signPayload,
} from './internal-execution'

function makeRequest(body: string, signature: string): Request {
  return new Request('http://localhost/test', {
    method: 'POST',
    body,
    headers: { 'X-Execution-Signature': signature },
  })
}

function validSignature(body: string): string {
  return createHmac('sha256', TEST_SECRET).update(body, 'utf8').digest('hex')
}

describe('signPayload', () => {
  it('produces a 64-char hex HMAC-SHA256 string', () => {
    const sig = signPayload('hello', TEST_SECRET)
    expect(sig).toHaveLength(64)
    expect(/^[0-9a-f]+$/.test(sig)).toBe(true)
  })

  it('matches what verifyInternalExecutionSignature accepts', () => {
    const body = '{"runId":"job-1"}'
    const sig = signPayload(body, TEST_SECRET)
    const req = makeRequest(body, sig)
    expect(() => verifyInternalExecutionSignature(body, req)).not.toThrow()
  })
})

describe('verifyInternalExecutionSignature', () => {
  it('accepts a valid HMAC signature', () => {
    const body = '{"runId":"job-1","kind":"result"}'
    const sig = validSignature(body)
    const req = makeRequest(body, sig)
    expect(() => verifyInternalExecutionSignature(body, req)).not.toThrow()
  })

  it('throws 401 on forged signature', () => {
    const body = '{"runId":"job-1"}'
    const req = makeRequest(body, 'a'.repeat(64))
    expect(() => verifyInternalExecutionSignature(body, req)).toThrow(
      expect.objectContaining({ httpStatus: 401 }),
    )
  })

  it('throws 401 on missing X-Execution-Signature header', () => {
    const req = new Request('http://localhost/test', {
      method: 'POST',
      body: '{}',
    })
    expect(() => verifyInternalExecutionSignature('{}', req)).toThrow(
      expect.objectContaining({ httpStatus: 401 }),
    )
  })

  it('throws 401 on signature wrong length (not 64 hex chars)', () => {
    const req = makeRequest('{}', 'abc123')
    expect(() => verifyInternalExecutionSignature('{}', req)).toThrow(
      expect.objectContaining({ httpStatus: 401 }),
    )
  })

  it('throws 500 when INTERNAL_CALLBACK_SECRET is not set', () => {
    vi.stubEnv('INTERNAL_CALLBACK_SECRET', '')
    const req = makeRequest('{}', 'a'.repeat(64))
    expect(() => verifyInternalExecutionSignature('{}', req)).toThrow(
      expect.objectContaining({ httpStatus: 500 }),
    )
    vi.stubEnv('INTERNAL_CALLBACK_SECRET', TEST_SECRET)
  })

  it('is timing-safe: equal-length wrong signature throws 401, not short-circuit', () => {
    const body = '{"runId":"job-1"}'
    const wrongSig = '0'.repeat(64)
    const req = makeRequest(body, wrongSig)
    expect(() => verifyInternalExecutionSignature(body, req)).toThrow(
      expect.objectContaining({ httpStatus: 401 }),
    )
  })
})
