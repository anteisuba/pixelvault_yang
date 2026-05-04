import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import {
  createPOST,
  mockAuthenticated,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockCompilePrompt = vi.fn()
const mockCompileNegativePrompt = vi.fn()

vi.mock('@/services/prompt-compiler.service', () => ({
  compilePrompt: (...args: unknown[]) => mockCompilePrompt(...args),
  compileNegativePrompt: (...args: unknown[]) =>
    mockCompileNegativePrompt(...args),
}))

import { POST } from '@/app/api/generation/compile/route'

const SAMPLE_INTENT = {
  subject: 'a young woman',
  style: 'photorealism',
  mustAvoid: ['logo'],
}

describe('POST /api/generation/compile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockCompilePrompt.mockReturnValue('compiled prompt')
    mockCompileNegativePrompt.mockReturnValue('logo')
  })

  it('returns 401 for unauthenticated requests', async () => {
    mockUnauthenticated()

    const req = createPOST('/api/generation/compile', {
      intent: SAMPLE_INTENT,
      modelId: AI_MODELS.FLUX_2_PRO,
    })
    const res = await POST(req)

    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid request bodies', async () => {
    const req = createPOST('/api/generation/compile', {
      intent: { subject: '' },
      modelId: AI_MODELS.FLUX_2_PRO,
    })
    const res = await POST(req)

    expect(res.status).toBe(400)
  })

  it('returns compiled prompt data for valid requests', async () => {
    const req = createPOST('/api/generation/compile', {
      intent: SAMPLE_INTENT,
      modelId: AI_MODELS.FLUX_2_PRO,
    })
    const res = await POST(req)
    const body = await parseJSON<{
      success: boolean
      data: {
        compiledPrompt: string
        negativePrompt?: string
      }
    }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.compiledPrompt).toBe('compiled prompt')
    expect(body.data.negativePrompt).toBe('logo')
    expect(mockCompilePrompt).toHaveBeenCalledWith(
      SAMPLE_INTENT,
      AI_MODELS.FLUX_2_PRO,
    )
  })

  it('returns 500 when compiler throws unexpectedly', async () => {
    mockCompilePrompt.mockImplementation(() => {
      throw new Error('compile failed')
    })

    const req = createPOST('/api/generation/compile', {
      intent: SAMPLE_INTENT,
      modelId: AI_MODELS.FLUX_2_PRO,
    })
    const res = await POST(req)

    expect(res.status).toBe(500)
  })
})
