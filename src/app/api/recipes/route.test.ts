import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  createPOST,
  createGET,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockCreate = vi.fn()
const mockList = vi.fn()

vi.mock('@/services/recipe.service', () => ({
  createRecipe: (...args: unknown[]) => mockCreate(...args),
  listRecipes: (...args: unknown[]) => mockList(...args),
}))

import { POST, GET } from '@/app/api/recipes/route'

const FAKE_RECIPE = {
  id: 'recipe_abc',
  userId: 'db_user_123',
  outputType: 'IMAGE',
  name: '',
  compiledPrompt: 'a beautiful sunset',
  negativePrompt: null,
  modelId: 'flux-2-pro',
  provider: 'fal',
  version: 1,
  isDeleted: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

describe('POST /api/recipes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockCreate.mockResolvedValue(FAKE_RECIPE)
  })

  it('returns 401 for unauthenticated requests', async () => {
    mockUnauthenticated()
    const req = createPOST('/api/recipes', {
      compiledPrompt: 'a cat',
      modelId: 'flux-2-pro',
      provider: 'fal',
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when compiledPrompt is missing', async () => {
    const req = createPOST('/api/recipes', {
      modelId: 'flux-2-pro',
      provider: 'fal',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when modelId is missing', async () => {
    const req = createPOST('/api/recipes', {
      compiledPrompt: 'a cat',
      provider: 'fal',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 201 with the created recipe', async () => {
    const req = createPOST('/api/recipes', {
      compiledPrompt: 'a beautiful sunset',
      modelId: 'flux-2-pro',
      provider: 'fal',
    })
    const res = await POST(req)
    const body = await parseJSON<{
      success: boolean
      data: typeof FAKE_RECIPE
    }>(res)

    expect(res.status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data.id).toBe('recipe_abc')
  })

  it('calls createRecipe with the authenticated clerkId', async () => {
    const req = createPOST('/api/recipes', {
      compiledPrompt: 'a cat',
      modelId: 'flux-2-pro',
      provider: 'fal',
    })
    await POST(req)
    expect(mockCreate).toHaveBeenCalledWith(
      'clerk_test_user',
      expect.objectContaining({ compiledPrompt: 'a cat' }),
    )
  })
})

describe('GET /api/recipes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockList.mockResolvedValue({ recipes: [FAKE_RECIPE], total: 1 })
  })

  it('returns 401 for unauthenticated requests', async () => {
    mockUnauthenticated()
    const req = createGET('/api/recipes')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns 200 with paginated recipes', async () => {
    const req = createGET('/api/recipes')
    const res = await GET(req)
    const body = await parseJSON<{
      success: boolean
      data: { recipes: (typeof FAKE_RECIPE)[]; total: number }
    }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.recipes).toHaveLength(1)
    expect(body.data.total).toBe(1)
  })

  it('passes page and limit query params to listRecipes', async () => {
    const req = createGET('/api/recipes', { page: '2', limit: '5' })
    await GET(req)
    expect(mockList).toHaveBeenCalledWith('clerk_test_user', 2, 5)
  })
})
