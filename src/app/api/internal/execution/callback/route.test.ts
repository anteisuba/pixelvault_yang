import { createHmac } from 'node:crypto'

import { NextRequest } from 'next/server'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { mockUnauthenticated, parseJSON } from '@/test/api-helpers'

vi.mock('@/services/generate-image.service', () => ({
  isGenerateImageServiceError: vi.fn(() => false),
}))

import { POST } from './route'

const CALLBACK_URL = 'http://localhost:3000/api/internal/execution/callback'
const CALLBACK_SECRET = 'test-internal-callback-secret'
const SIGNATURE_HEADER = 'X-Execution-Signature'

const ORIGINAL_CALLBACK_SECRET = process.env.INTERNAL_CALLBACK_SECRET

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

function signBody(body: string, secret = CALLBACK_SECRET): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex')
}

function createCallbackRequest(payload: unknown, signature?: string) {
  const body = JSON.stringify(payload)

  return new NextRequest(CALLBACK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [SIGNATURE_HEADER]: signature ?? signBody(body),
    },
    body,
  })
}

describe('POST /api/internal/execution/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUnauthenticated()
    process.env.INTERNAL_CALLBACK_SECRET = CALLBACK_SECRET
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
    const json = await parseJSON<ApiEnvelope<{ receivedAt: string }>>(res)

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data?.receivedAt).toEqual(expect.any(String))
  })

  it('returns 401 for a forged execution signature', async () => {
    const req = createCallbackRequest(VALID_PAYLOAD, signBody('forged-body'))
    const res = await POST(req)
    const json = await parseJSON<ApiEnvelope<never>>(res)

    expect(res.status).toBe(401)
    expect(json.success).toBe(false)
    expect(json.errorCode).toBe('INVALID_EXECUTION_SIGNATURE')
  })
})
