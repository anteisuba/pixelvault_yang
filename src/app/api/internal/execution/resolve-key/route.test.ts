import { NextRequest } from 'next/server'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { EXECUTION_INTERNAL } from '@/constants/execution'
import { ApiRequestError } from '@/lib/errors'
import { createInternalExecutionHeaders } from '@/lib/signature-verifiers/internal-execution'
import { resolveExecutionApiKey } from '@/services/api-key-resolver.service'
import { parseJSON } from '@/test/api-helpers'
import type { ResolveKeyResponse } from '@/types'

import { POST } from './route'

vi.mock('@/services/api-key-resolver.service', () => ({
  resolveExecutionApiKey: vi.fn(),
}))

const RESOLVE_KEY_URL =
  'http://localhost:3000/api/internal/execution/resolve-key'
const CALLBACK_SECRET = 'test-internal-callback-secret'
const ORIGINAL_CALLBACK_SECRET = process.env.INTERNAL_CALLBACK_SECRET

const VALID_PAYLOAD = {
  runId: 'job-1',
  apiKeyId: 'key-1',
}

const mockResolveExecutionApiKey = vi.mocked(resolveExecutionApiKey)

interface CallbackRequestOptions {
  signature?: string | null
  nonce?: string
}

interface ApiEnvelope<TData> {
  success: boolean
  data?: TData
  error?: string
  errorCode?: string
}

function createResolveKeyRequestFromBody(
  body: string,
  options: CallbackRequestOptions = {},
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (options.signature !== null) {
    Object.assign(
      headers,
      createInternalExecutionHeaders({
        body,
        method: 'POST',
        url: RESOLVE_KEY_URL,
        secret: CALLBACK_SECRET,
        nonce: options.nonce,
      }),
    )
    if (options.signature) {
      headers[EXECUTION_INTERNAL.SIGNATURE_HEADER] = options.signature
    }
  }

  return new NextRequest(RESOLVE_KEY_URL, {
    method: 'POST',
    headers,
    body,
  })
}

function createResolveKeyRequest(payload: unknown, signature?: string | null) {
  const body = JSON.stringify(payload)
  return createResolveKeyRequestFromBody(body, { signature })
}

function forbiddenError() {
  return new ApiRequestError(
    'FORBIDDEN',
    403,
    'errors.auth.forbidden',
    'Forbidden.',
  )
}

describe('POST /api/internal/execution/resolve-key', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.INTERNAL_CALLBACK_SECRET = CALLBACK_SECRET
    mockResolveExecutionApiKey.mockResolvedValue({ apiKey: 'plain-key' })
  })

  afterEach(() => {
    vi.restoreAllMocks()

    if (ORIGINAL_CALLBACK_SECRET === undefined) {
      delete process.env.INTERNAL_CALLBACK_SECRET
      return
    }

    process.env.INTERNAL_CALLBACK_SECRET = ORIGINAL_CALLBACK_SECRET
  })

  it('returns 200 for a valid signed request when job and key scope match', async () => {
    const req = createResolveKeyRequest(VALID_PAYLOAD)
    const res = await POST(req)
    const json = await parseJSON<ApiEnvelope<ResolveKeyResponse>>(res)

    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(json.success).toBe(true)
    expect(json.data).toEqual({ apiKey: 'plain-key' })
    expect(mockResolveExecutionApiKey).toHaveBeenCalledWith(VALID_PAYLOAD)
  })

  it('rejects replaying the same signed resolve-key request', async () => {
    const body = JSON.stringify(VALID_PAYLOAD)
    const nonce = 'resolve-key-replay-123456'
    const first = createResolveKeyRequestFromBody(body, { nonce })
    const replay = createResolveKeyRequestFromBody(body, { nonce })

    expect((await POST(first)).status).toBe(200)
    const replayResponse = await POST(replay)
    const replayJson = await parseJSON<ApiEnvelope<never>>(replayResponse)

    expect(replayResponse.status).toBe(401)
    expect(replayJson.errorCode).toBe('EXECUTION_REPLAY_DETECTED')
    expect(mockResolveExecutionApiKey).toHaveBeenCalledTimes(1)
  })

  it('returns 403 when runId does not match a generationJob', async () => {
    mockResolveExecutionApiKey.mockRejectedValue(forbiddenError())

    const req = createResolveKeyRequest(VALID_PAYLOAD)
    const res = await POST(req)
    const json = await parseJSON<ApiEnvelope<never>>(res)

    expect(res.status).toBe(403)
    expect(json.errorCode).toBe('FORBIDDEN')
  })

  it('returns 403 when apiKeyId does not belong to the run owner', async () => {
    mockResolveExecutionApiKey.mockRejectedValue(forbiddenError())

    const req = createResolveKeyRequest({
      runId: VALID_PAYLOAD.runId,
      apiKeyId: 'other-user-key',
    })
    const res = await POST(req)
    const json = await parseJSON<ApiEnvelope<never>>(res)

    expect(res.status).toBe(403)
    expect(json.errorCode).toBe('FORBIDDEN')
  })

  it('returns 403 when the generationJob is terminal', async () => {
    mockResolveExecutionApiKey.mockRejectedValue(forbiddenError())

    const req = createResolveKeyRequest(VALID_PAYLOAD)
    const res = await POST(req)
    const json = await parseJSON<ApiEnvelope<never>>(res)

    expect(res.status).toBe(403)
    expect(json.errorCode).toBe('FORBIDDEN')
  })

  it('returns 401 for an invalid execution signature', async () => {
    const req = createResolveKeyRequest(VALID_PAYLOAD, 'a'.repeat(64))
    const res = await POST(req)
    const json = await parseJSON<ApiEnvelope<never>>(res)

    expect(res.status).toBe(401)
    expect(json.errorCode).toBe('INVALID_EXECUTION_SIGNATURE')
    expect(mockResolveExecutionApiKey).not.toHaveBeenCalled()
  })

  it('returns 400 for malformed request body', async () => {
    const req = createResolveKeyRequest({ runId: VALID_PAYLOAD.runId })
    const res = await POST(req)
    const json = await parseJSON<ApiEnvelope<never>>(res)

    expect(res.status).toBe(400)
    expect(json.errorCode).toBe('VALIDATION_ERROR')
    expect(mockResolveExecutionApiKey).not.toHaveBeenCalled()
  })
})
