import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  createPOST,
  parseJSON,
} from '@/test/api-helpers'
import { ApiRequestError } from '@/lib/errors'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockEvaluate = vi.fn()

vi.mock('@/services/generation-evaluator.service', () => ({
  evaluateGeneration: (...args: unknown[]) => mockEvaluate(...args),
}))

import { POST } from '@/app/api/generation/evaluate/route'

const SAMPLE_EVALUATION = {
  subjectMatch: 9,
  styleMatch: 8,
  compositionMatch: 7.5,
  artifactScore: 10,
  promptAdherence: 8.5,
  overall: 8.6,
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
      data: { evaluation: typeof SAMPLE_EVALUATION }
    }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.evaluation.overall).toBe(8.6)
    expect(Array.isArray(body.data.evaluation.detectedIssues)).toBe(true)
  })

  it('calls evaluateGeneration with the authenticated clerkId', async () => {
    const req = createPOST('/api/generation/evaluate', {
      generationId: 'gen_xyz',
    })

    await POST(req)

    expect(mockEvaluate).toHaveBeenCalledWith('clerk_test_user', 'gen_xyz')
  })

  it('returns 403 when the generation belongs to another user', async () => {
    mockEvaluate.mockRejectedValue(
      new ApiRequestError(
        'GENERATION_FORBIDDEN',
        403,
        'errors.auth.forbidden',
        'You do not have permission to evaluate this generation.',
      ),
    )

    const req = createPOST('/api/generation/evaluate', {
      generationId: 'gen_other',
    })
    const res = await POST(req)

    expect(res.status).toBe(403)
  })

  it('returns 200 with cached evaluation for idempotent requests', async () => {
    const cachedEvaluation = {
      ...SAMPLE_EVALUATION,
      overall: 7.5,
      detectedIssues: ['cached issue'],
    }
    mockEvaluate.mockResolvedValue(cachedEvaluation)

    const req = createPOST('/api/generation/evaluate', {
      generationId: 'gen_cached',
    })
    const res = await POST(req)
    const body = await parseJSON<{
      success: boolean
      data: { evaluation: typeof cachedEvaluation }
    }>(res)

    expect(res.status).toBe(200)
    expect(body.data.evaluation.overall).toBe(7.5)
    expect(mockEvaluate).toHaveBeenCalledTimes(1)
  })
})
