import { createHmac } from 'node:crypto'

import { NextRequest } from 'next/server'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { parseJSON } from '@/test/api-helpers'
import { ApiRequestError } from '@/lib/errors'
import {
  handleExecutionCallback,
  type CallbackResult,
} from '@/services/execution-callback.service'

import { POST } from './route'

vi.mock('@/services/execution-callback.service', () => ({
  handleExecutionCallback: vi.fn(),
}))

const CALLBACK_URL = 'http://localhost:3000/api/internal/execution/callback'
const CALLBACK_SECRET = 'test-internal-callback-secret'
const SIGNATURE_HEADER = 'X-Execution-Signature'

const ORIGINAL_CALLBACK_SECRET = process.env.INTERNAL_CALLBACK_SECRET

interface CallbackRequestOptions {
  signature?: string | null
}

interface ApiEnvelope<TData> {
  success: boolean
  data?: TData
  error?: string
  errorCode?: string
}

const VALID_PAYLOAD = {
  runId: 'run_test_123',
  kind: 'ping' as const,
  ts: '2026-04-24T00:00:00.000Z',
  data: { echoed: true },
}

const VALID_CALLBACK_RESULT: CallbackResult = {
  runId: VALID_PAYLOAD.runId,
  jobStatus: 'RUNNING',
  action: 'logged',
}

const mockHandleExecutionCallback = vi.mocked(handleExecutionCallback)

function signBody(body: string, secret = CALLBACK_SECRET): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex')
}

function createCallbackRequestFromBody(
  body: string,
  options: CallbackRequestOptions = {},
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (options.signature !== null) {
    headers[SIGNATURE_HEADER] = options.signature ?? signBody(body)
  }

  return new NextRequest(CALLBACK_URL, {
    method: 'POST',
    headers,
    body,
  })
}

function createCallbackRequest(payload: unknown, signature?: string | null) {
  const body = JSON.stringify(payload)
  return createCallbackRequestFromBody(body, { signature })
}

describe('POST /api/internal/execution/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.INTERNAL_CALLBACK_SECRET = CALLBACK_SECRET
    mockHandleExecutionCallback.mockResolvedValue(VALID_CALLBACK_RESULT)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()

    if (ORIGINAL_CALLBACK_SECRET === undefined) {
      delete process.env.INTERNAL_CALLBACK_SECRET
      return
    }

    process.env.INTERNAL_CALLBACK_SECRET = ORIGINAL_CALLBACK_SECRET
  })

  it('returns 200 for a valid execution signature', async () => {
    const req = createCallbackRequest(VALID_PAYLOAD)
    const res = await POST(req)
    const json = await parseJSON<ApiEnvelope<CallbackResult>>(res)

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data).toEqual(VALID_CALLBACK_RESULT)
    expect(mockHandleExecutionCallback).toHaveBeenCalledWith(VALID_PAYLOAD)
  })

  it('returns 401 for a forged execution signature', async () => {
    const req = createCallbackRequest(VALID_PAYLOAD, signBody('forged-body'))
    const res = await POST(req)
    const json = await parseJSON<ApiEnvelope<never>>(res)

    expect(res.status).toBe(401)
    expect(json.success).toBe(false)
    expect(json.errorCode).toBe('INVALID_EXECUTION_SIGNATURE')
    expect(mockHandleExecutionCallback).not.toHaveBeenCalled()
  })

  it('returns 401 when execution signature header is missing', async () => {
    const req = createCallbackRequest(VALID_PAYLOAD, null)
    const res = await POST(req)
    const json = await parseJSON<ApiEnvelope<never>>(res)

    expect(res.status).toBe(401)
    expect(json.success).toBe(false)
    expect(json.errorCode).toBe('INVALID_EXECUTION_SIGNATURE')
    expect(mockHandleExecutionCallback).not.toHaveBeenCalled()
  })

  it('returns 400 for malformed JSON body after signature verification', async () => {
    const body = '{"runId":'
    const req = createCallbackRequestFromBody(body)
    const res = await POST(req)
    const json = await parseJSON<ApiEnvelope<never>>(res)

    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
    expect(json.errorCode).toBe('INVALID_JSON')
    expect(mockHandleExecutionCallback).not.toHaveBeenCalled()
  })

  it('returns 400 when a signed payload is missing required fields', async () => {
    const req = createCallbackRequest({
      kind: 'ping',
      ts: '2026-04-24T00:00:00.000Z',
    })
    const res = await POST(req)
    const json = await parseJSON<ApiEnvelope<never>>(res)

    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
    expect(json.errorCode).toBe('VALIDATION_ERROR')
    expect(mockHandleExecutionCallback).not.toHaveBeenCalled()
  })

  it('returns 500 when internal callback secret is not configured', async () => {
    delete process.env.INTERNAL_CALLBACK_SECRET

    const req = createCallbackRequest(VALID_PAYLOAD)
    const res = await POST(req)
    const json = await parseJSON<ApiEnvelope<never>>(res)

    expect(res.status).toBe(500)
    expect(json.success).toBe(false)
    expect(json.errorCode).toBe('INTERNAL_CALLBACK_SECRET_MISSING')
    expect(mockHandleExecutionCallback).not.toHaveBeenCalled()
  })

  it('returns 404 when a signed runId does not match a generationJob', async () => {
    mockHandleExecutionCallback.mockRejectedValue(
      new ApiRequestError(
        'EXECUTION_RUN_NOT_FOUND',
        404,
        'errors.execution.runNotFound',
        'Execution run not found.',
      ),
    )

    const req = createCallbackRequest(VALID_PAYLOAD)
    const res = await POST(req)
    const json = await parseJSON<ApiEnvelope<never>>(res)

    expect(res.status).toBe(404)
    expect(json.success).toBe(false)
    expect(json.errorCode).toBe('EXECUTION_RUN_NOT_FOUND')
    expect(mockHandleExecutionCallback).toHaveBeenCalledWith(VALID_PAYLOAD)
  })
})
