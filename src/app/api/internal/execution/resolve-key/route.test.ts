import { createHmac } from 'node:crypto'

import { NextRequest } from 'next/server'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { EXECUTION_INTERNAL } from '@/constants/execution'
import { ApiRequestError } from '@/lib/errors'
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
}

interface ApiEnvelope<TData> {
  success: boolean
  data?: TData
  error?: string
  errorCode?: string
}

function signBody(body: string, secret = CALLBACK_SECRET): string {
  return createHmac(EXECUTION_INTERNAL.SIGNATURE_ALGORITHM, secret)
    .update(body, 'utf8')
    .digest('hex')
}

function createResolveKeyRequestFromBody(
  body: string,
  options: CallbackRequestOptions = {},
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (options.signature !== null) {
    headers[EXECUTION_INTERNAL.SIGNATURE_HEADER] =
      options.signature ?? signBody(body)
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
    const req = createResolveKeyRequest(VALID_PAYLOAD, signBody('forged-body'))
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
