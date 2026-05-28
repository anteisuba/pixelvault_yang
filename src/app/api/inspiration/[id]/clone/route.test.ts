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

const mockClone = vi.fn()
vi.mock('@/services/prompts/inspiration.service', () => ({
  cloneInspirationToRecipe: (...args: unknown[]) => mockClone(...args),
}))

import { POST } from '@/app/api/inspiration/[id]/clone/route'
import { ApiRequestError } from '@/lib/errors'

const FAKE_RECIPE = {
  id: 'recipe_abc',
  userId: 'db_user_123',
  outputType: 'IMAGE',
  name: 'Cloned from inspiration',
  compiledPrompt: 'a beautiful sunset',
  negativePrompt: null,
  modelId: 'gpt-image-2',
  provider: 'OpenAI',
  version: 1,
  isDeleted: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

const FAKE_CONTEXT = {
  params: Promise.resolve({ id: 'insp_1' }),
}

describe('POST /api/inspiration/[id]/clone', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockClone.mockResolvedValue(FAKE_RECIPE)
  })

  it('returns 401 for unauthenticated requests', async () => {
    mockUnauthenticated()
    const req = createPOST('/api/inspiration/insp_1/clone', {})
    const res = await POST(req, FAKE_CONTEXT)
    expect(res.status).toBe(401)
  })

  it('returns 201 with the cloned recipe on success', async () => {
    const req = createPOST('/api/inspiration/insp_1/clone', {})
    const res = await POST(req, FAKE_CONTEXT)
    const body = await parseJSON<{
      success: boolean
      data: typeof FAKE_RECIPE
    }>(res)

    expect(res.status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data.id).toBe('recipe_abc')
  })

  it('passes the [id] path param + auth + body to the service', async () => {
    const overrides = {
      modelId: 'flux-2-pro',
      provider: 'fal.ai',
      outputType: 'IMAGE' as const,
    }
    const req = createPOST('/api/inspiration/insp_1/clone', overrides)
    await POST(req, FAKE_CONTEXT)
    expect(mockClone).toHaveBeenCalledWith(
      'clerk_test_user',
      'insp_1',
      expect.objectContaining(overrides),
    )
  })

  it('returns 400 when body has invalid outputType', async () => {
    const req = createPOST('/api/inspiration/insp_1/clone', {
      outputType: 'INVALID',
    })
    const res = await POST(req, FAKE_CONTEXT)
    expect(res.status).toBe(400)
  })

  it('returns 404 when service throws inspiration-not-found', async () => {
    mockClone.mockRejectedValue(
      new ApiRequestError(
        'INSPIRATION_NOT_FOUND',
        404,
        'errors.inspiration.notFound',
        'Inspiration insp_missing not found',
      ),
    )
    const req = createPOST('/api/inspiration/insp_missing/clone', {})
    const res = await POST(req, {
      params: Promise.resolve({ id: 'insp_missing' }),
    })
    expect(res.status).toBe(404)
  })
})
