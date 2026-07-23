import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EXECUTION_INTERNAL } from '@/constants/execution'

import {
  createInternalExecutionHeaders,
  verifyInternalExecutionSignature,
} from './internal-execution'

const TEST_SECRET = 'test-secret-32-characters-minimum'
const TEST_URL =
  'http://localhost/api/internal/execution/callback?ignored=query'

function makeSignedRequest(
  body: string,
  options: {
    url?: string
    method?: string
    timestamp?: number
    nonce?: string
    secret?: string
  } = {},
): Request {
  const url = options.url ?? TEST_URL
  const method = options.method ?? 'POST'
  const headers = createInternalExecutionHeaders({
    body,
    method,
    url,
    secret: options.secret ?? TEST_SECRET,
    timestamp: options.timestamp,
    nonce: options.nonce,
  })

  return new Request(url, {
    method,
    body,
    headers,
  })
}

describe('internal execution signed request protocol', () => {
  beforeEach(() => {
    vi.stubEnv('INTERNAL_CALLBACK_SECRET', TEST_SECRET)
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('creates a versioned 64-character signature with timestamp and nonce', () => {
    const headers = createInternalExecutionHeaders({
      body: '{"runId":"job-1"}',
      method: 'POST',
      url: TEST_URL,
      secret: TEST_SECRET,
      timestamp: 1_752_000_000_000,
      nonce: 'nonce-1234567890abcdef',
    })

    expect(headers[EXECUTION_INTERNAL.SIGNATURE_HEADER]).toMatch(
      /^[0-9a-f]{64}$/,
    )
    expect(headers[EXECUTION_INTERNAL.TIMESTAMP_HEADER]).toBe('1752000000000')
    expect(headers[EXECUTION_INTERNAL.NONCE_HEADER]).toBe(
      'nonce-1234567890abcdef',
    )
    expect(headers[EXECUTION_INTERNAL.VERSION_HEADER]).toBe('v1')
  })

  it('accepts a fresh request signed for the exact method and path', async () => {
    const body = '{"runId":"job-valid","kind":"result"}'
    const request = makeSignedRequest(body, {
      nonce: 'nonce-valid-1234567890',
    })

    await expect(
      verifyInternalExecutionSignature(body, request),
    ).resolves.toBeUndefined()
  })

  it('rejects a signature replay even while the timestamp is still fresh', async () => {
    const body = '{"runId":"job-replay"}'
    const requestA = makeSignedRequest(body, {
      nonce: 'nonce-replay-123456789',
    })
    const requestB = makeSignedRequest(body, {
      nonce: 'nonce-replay-123456789',
    })

    await expect(
      verifyInternalExecutionSignature(body, requestA),
    ).resolves.toBeUndefined()
    await expect(
      verifyInternalExecutionSignature(body, requestB),
    ).rejects.toMatchObject({
      errorCode: 'EXECUTION_REPLAY_DETECTED',
      httpStatus: 401,
    })
  })

  it('rejects a request signed for a different path', async () => {
    const body = '{"runId":"job-path"}'
    const signed = makeSignedRequest(body, {
      nonce: 'nonce-path-123456789012',
    })
    const request = new Request(
      'http://localhost/api/internal/execution/resolve-key',
      {
        method: 'POST',
        body,
        headers: signed.headers,
      },
    )

    await expect(
      verifyInternalExecutionSignature(body, request),
    ).rejects.toMatchObject({
      errorCode: 'INVALID_EXECUTION_SIGNATURE',
      httpStatus: 401,
    })
  })

  it('rejects an expired timestamp before consuming the nonce', async () => {
    const body = '{"runId":"job-expired"}'
    const request = makeSignedRequest(body, {
      timestamp: Date.now() - EXECUTION_INTERNAL.MAX_CLOCK_SKEW_MS - 1,
      nonce: 'nonce-expired-123456789',
    })

    await expect(
      verifyInternalExecutionSignature(body, request),
    ).rejects.toMatchObject({
      errorCode: 'EXECUTION_SIGNATURE_EXPIRED',
      httpStatus: 401,
    })
  })

  it('rejects missing protocol headers', async () => {
    const request = new Request(TEST_URL, {
      method: 'POST',
      body: '{}',
      headers: {
        [EXECUTION_INTERNAL.SIGNATURE_HEADER]: 'a'.repeat(64),
      },
    })

    await expect(
      verifyInternalExecutionSignature('{}', request),
    ).rejects.toMatchObject({
      errorCode: 'INVALID_EXECUTION_SIGNATURE',
      httpStatus: 401,
    })
  })

  it('fails closed when the shared secret is missing', async () => {
    vi.stubEnv('INTERNAL_CALLBACK_SECRET', '')
    const request = makeSignedRequest('{}', {
      nonce: 'nonce-secret-1234567890',
    })

    await expect(
      verifyInternalExecutionSignature('{}', request),
    ).rejects.toMatchObject({
      errorCode: 'INTERNAL_CALLBACK_SECRET_MISSING',
      httpStatus: 500,
    })
  })
})
