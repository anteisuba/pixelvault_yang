import { describe, it, expect, vi, beforeEach } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import {
  mockAuthenticated,
  mockUnauthenticated,
  createPOST,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockParseIntent = vi.fn()
const mockRouteModels = vi.fn()
const mockEstimateModelCost = vi.fn()
const mockCompilePrompt = vi.fn()
const mockCompileNegativePrompt = vi.fn()
const mockEnsureUser = vi.fn()

vi.mock('@/services/intent-parser.service', () => ({
  parseImageIntent: (...args: unknown[]) => mockParseIntent(...args),
}))

vi.mock('@/services/model-router.service', () => ({
  routeModelsForIntent: (...args: unknown[]) => mockRouteModels(...args),
  estimateModelCost: (...args: unknown[]) => mockEstimateModelCost(...args),
}))

vi.mock('@/services/prompt-compiler.service', () => ({
  compilePrompt: (...args: unknown[]) => mockCompilePrompt(...args),
  compileNegativePrompt: (...args: unknown[]) =>
    mockCompileNegativePrompt(...args),
}))

vi.mock('@/services/user.service', () => ({
  ensureUser: (...args: unknown[]) => mockEnsureUser(...args),
}))

import { POST } from '@/app/api/generation/plan/route'

const SAMPLE_INTENT = {
  subject: 'a woman',
  style: 'photorealism',
}

const SAMPLE_MODELS = [
  {
    modelId: AI_MODELS.FLUX_2_PRO,
    score: 2,
    reason: 'Matches: photorealistic, portrait.',
    matchedBestFor: ['photorealistic', 'portrait'],
  },
]

describe('POST /api/generation/plan', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockEnsureUser.mockResolvedValue({ id: 'db_user_123' })
    mockParseIntent.mockResolvedValue(SAMPLE_INTENT)
    mockRouteModels.mockResolvedValue(SAMPLE_MODELS)
    mockEstimateModelCost.mockReturnValue(2)
    mockCompilePrompt.mockReturnValue('compiled prompt')
    mockCompileNegativePrompt.mockReturnValue('low quality')
  })

  it('returns 401 for unauthenticated requests', async () => {
    mockUnauthenticated()

    const req = createPOST('/api/generation/plan', {
      naturalLanguage: 'a beautiful portrait',
    })
    const res = await POST(req)

    expect(res.status).toBe(401)
  })

  it('returns 400 when naturalLanguage is missing', async () => {
    const req = createPOST('/api/generation/plan', {})
    const res = await POST(req)

    expect(res.status).toBe(400)
  })

  it('returns 400 when naturalLanguage is empty string', async () => {
    const req = createPOST('/api/generation/plan', { naturalLanguage: '' })
    const res = await POST(req)

    expect(res.status).toBe(400)
  })

  it('returns 400 when naturalLanguage is whitespace only', async () => {
    const req = createPOST('/api/generation/plan', { naturalLanguage: '   ' })
    const res = await POST(req)

    expect(res.status).toBe(400)
  })

  it('returns 200 with plan data on valid request', async () => {
    const req = createPOST('/api/generation/plan', {
      naturalLanguage: 'a cinematic portrait',
    })
    const res = await POST(req)
    const body = await parseJSON<{
      success: boolean
      data: {
        intent: typeof SAMPLE_INTENT
        recommendedModels: typeof SAMPLE_MODELS
        promptDraft: string
        negativePrompt: string
        estimatedCost: number
        variationCount: number
      }
    }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.intent).toMatchObject({ subject: 'a woman' })
    expect(body.data.recommendedModels).toHaveLength(1)
    expect(body.data.variationCount).toBe(4)
    expect(body.data.negativePrompt).toBe('low quality')
    expect(body.data.estimatedCost).toBe(2)
    expect(typeof body.data.promptDraft).toBe('string')
  })

  it('calls parseImageIntent with naturalLanguage and referenceAssets', async () => {
    const referenceAssets = [
      { url: 'https://example.com/img.jpg', role: 'identity' },
    ]
    const req = createPOST('/api/generation/plan', {
      naturalLanguage: 'a portrait',
      referenceAssets,
    })

    await POST(req)

    expect(mockParseIntent).toHaveBeenCalledWith('a portrait', referenceAssets)
  })

  it('returns 500 when intent-parser throws unexpectedly', async () => {
    mockParseIntent.mockRejectedValue(new Error('unexpected crash'))

    const req = createPOST('/api/generation/plan', {
      naturalLanguage: 'a portrait',
    })
    const res = await POST(req)

    expect(res.status).toBe(500)
  })

  it('calls compilePrompt with the top-ranked model id', async () => {
    const req = createPOST('/api/generation/plan', {
      naturalLanguage: 'a cinematic portrait',
    })

    await POST(req)

    expect(mockCompilePrompt).toHaveBeenCalledWith(
      SAMPLE_INTENT,
      SAMPLE_MODELS[0].modelId,
    )
  })

  it('passes optional router preferences into model routing', async () => {
    const req = createPOST('/api/generation/plan', {
      naturalLanguage: 'a cinematic portrait',
      preferences: { preferLowCost: true },
    })

    await POST(req)

    expect(mockRouteModels).toHaveBeenCalledWith(
      SAMPLE_INTENT,
      {
        preferLowCost: true,
      },
      { userId: 'db_user_123' },
    )
  })

  it('uses the top-ranked model id for estimated cost', async () => {
    const req = createPOST('/api/generation/plan', {
      naturalLanguage: 'a cinematic portrait',
    })

    await POST(req)

    expect(mockEstimateModelCost).toHaveBeenCalledWith(SAMPLE_MODELS[0].modelId)
  })
})
