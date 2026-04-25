import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  createPOST,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockEvaluate = vi.fn()

vi.mock('@/services/generation-evaluator.service', () => ({
  evaluateGeneration: (...args: unknown[]) => mockEvaluate(...args),
}))

import { POST } from '@/app/api/generation/evaluate/route'

const SAMPLE_EVALUATION = {
  subjectMatch: 0.9,
  styleMatch: 0.8,
  compositionMatch: 0.75,
  artifactScore: 1.0,
  promptAdherence: 0.85,
  overall: 0.86,
  detectedIssues: [],
  suggestedFixes: [],
}

describe('POST /api/generation/evaluate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockEvaluate.mockResolvedValue(SAMPLE_EVALUATION)
  })

  it('returns 401 for unauthenticated requests', async () => {
    mockUnauthenticated()

    const req = createPOST('/api/generation/evaluate', {
      generationId: 'gen_abc',
    })
    const res = await POST(req)

    expect(res.status).toBe(401)
  })

  it('returns 400 when generationId is missing', async () => {
    const req = createPOST('/api/generation/evaluate', {})
    const res = await POST(req)

    expect(res.status).toBe(400)
  })

  it('returns 400 when generationId is an empty string', async () => {
    const req = createPOST('/api/generation/evaluate', { generationId: '' })
    const res = await POST(req)

    expect(res.status).toBe(400)
  })

  it('returns 200 with evaluation on valid request', async () => {
    const req = createPOST('/api/generation/evaluate', {
      generationId: 'gen_abc',
    })
    const res = await POST(req)
    const body = await parseJSON<{
      success: boolean
      data: typeof SAMPLE_EVALUATION
    }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.overall).toBe(0.86)
    expect(Array.isArray(body.data.detectedIssues)).toBe(true)
  })

  it('calls evaluateGeneration with the authenticated clerkId', async () => {
    const req = createPOST('/api/generation/evaluate', {
      generationId: 'gen_xyz',
    })

    await POST(req)

    expect(mockEvaluate).toHaveBeenCalledWith('clerk_test_user', 'gen_xyz')
  })

  it('returns 500 when service throws (e.g. generation not found)', async () => {
    mockEvaluate.mockRejectedValue(new Error('Generation not found'))

    const req = createPOST('/api/generation/evaluate', {
      generationId: 'gen_missing',
    })
    const res = await POST(req)

    expect(res.status).toBe(500)
  })
})
