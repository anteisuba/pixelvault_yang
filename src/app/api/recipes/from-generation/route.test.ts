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

const mockCreateFromGeneration = vi.fn()

vi.mock('@/services/prompts/recipe.service', () => ({
  createRecipeFromGeneration: (...args: unknown[]) =>
    mockCreateFromGeneration(...args),
}))

import { POST } from '@/app/api/recipes/from-generation/route'

const FAKE_RECIPE = {
  id: 'recipe_abc',
  userId: 'db_user_123',
  outputType: 'IMAGE',
  name: 'Hero prompt',
  compiledPrompt: 'a beautiful sunset',
  negativePrompt: null,
  modelId: 'flux-2-pro',
  provider: 'fal',
  version: 1,
  isDeleted: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

describe('POST /api/recipes/from-generation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockCreateFromGeneration.mockResolvedValue(FAKE_RECIPE)
  })

  it('returns 401 for unauthenticated requests', async () => {
    mockUnauthenticated()
    const req = createPOST('/api/recipes/from-generation', {
      generationId: 'gen_source',
    })
    const res = await POST(req)

    expect(res.status).toBe(401)
  })

  it('returns 400 when generationId is missing', async () => {
    const req = createPOST('/api/recipes/from-generation', {})
    const res = await POST(req)

    expect(res.status).toBe(400)
  })

  it('creates a recipe from the authenticated user generation', async () => {
    const req = createPOST('/api/recipes/from-generation', {
      generationId: 'gen_source',
      name: 'Hero prompt',
    })
    const res = await POST(req)
    const body = await parseJSON<{
      success: boolean
      data: typeof FAKE_RECIPE
    }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.id).toBe('recipe_abc')
    expect(mockCreateFromGeneration).toHaveBeenCalledWith('clerk_test_user', {
      generationId: 'gen_source',
      name: 'Hero prompt',
    })
  })
})
