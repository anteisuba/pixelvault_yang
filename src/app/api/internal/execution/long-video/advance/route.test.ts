import { createHmac } from 'node:crypto'

import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { parseJSON } from '@/test/api-helpers'
import { applyLongVideoPipelineWorkerUpdate } from '@/services/video-pipeline.service'

import { POST } from './route'

vi.mock('@/services/video-pipeline.service', () => ({
  applyLongVideoPipelineWorkerUpdate: vi.fn(),
}))

const ADVANCE_URL =
  'http://localhost:3000/api/internal/execution/long-video/advance'
const CALLBACK_SECRET = 'test-internal-callback-secret'
const SIGNATURE_HEADER = 'X-Execution-Signature'
const ORIGINAL_CALLBACK_SECRET = process.env.INTERNAL_CALLBACK_SECRET

interface ApiEnvelope<TData> {
  success: boolean
  data?: TData
  error?: string
  errorCode?: string
}

const PIPELINE_STATUS = {
  pipelineId: 'pipeline-1',
  status: 'RUNNING' as const,
  totalClips: 3,
  completedClips: 1,
  currentDurationSec: 10,
  targetDurationSec: 20,
  clips: [],
}

const mockApplyUpdate = vi.mocked(applyLongVideoPipelineWorkerUpdate)

function signBody(body: string, secret = CALLBACK_SECRET): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex')
}

function createAdvanceRequest(payload: unknown, signature?: string | null) {
  const body = JSON.stringify(payload)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (signature !== null) {
    headers[SIGNATURE_HEADER] = signature ?? signBody(body)
  }

  return new NextRequest(ADVANCE_URL, {
    method: 'POST',
    headers,
    body,
  })
}

describe('POST /api/internal/execution/long-video/advance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.INTERNAL_CALLBACK_SECRET = CALLBACK_SECRET
    mockApplyUpdate.mockResolvedValue(PIPELINE_STATUS)
  })

  afterEach(() => {
    if (ORIGINAL_CALLBACK_SECRET === undefined) {
      delete process.env.INTERNAL_CALLBACK_SECRET
      return
    }

    process.env.INTERNAL_CALLBACK_SECRET = ORIGINAL_CALLBACK_SECRET
  })

  it('advances a signed long-video pipeline tick', async () => {
    const req = createAdvanceRequest({
      runId: 'pipeline-1',
      pipelineId: 'pipeline-1',
      action: 'advance',
      attempt: 2,
    })

    const res = await POST(req)
    const json = await parseJSON<ApiEnvelope<typeof PIPELINE_STATUS>>(res)

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data?.status).toBe('RUNNING')
    expect(mockApplyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'pipeline-1',
        pipelineId: 'pipeline-1',
        action: 'advance',
        attempt: 2,
      }),
    )
  })

  it('marks a pipeline failed from a signed worker failure', async () => {
    mockApplyUpdate.mockResolvedValueOnce({
      ...PIPELINE_STATUS,
      status: 'FAILED',
    })

    const req = createAdvanceRequest({
      runId: 'pipeline-1',
      pipelineId: 'pipeline-1',
      action: 'fail',
      error: 'workflow timed out',
    })

    const res = await POST(req)
    const json = await parseJSON<ApiEnvelope<typeof PIPELINE_STATUS>>(res)

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data?.status).toBe('FAILED')
    expect(mockApplyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'fail',
        error: 'workflow timed out',
      }),
    )
  })

  it('rejects missing signatures', async () => {
    const req = createAdvanceRequest(
      { runId: 'pipeline-1', pipelineId: 'pipeline-1' },
      null,
    )

    const res = await POST(req)
    const json = await parseJSON<ApiEnvelope<never>>(res)

    expect(res.status).toBe(401)
    expect(json.success).toBe(false)
    expect(json.errorCode).toBe('INVALID_EXECUTION_SIGNATURE')
    expect(mockApplyUpdate).not.toHaveBeenCalled()
  })
})
