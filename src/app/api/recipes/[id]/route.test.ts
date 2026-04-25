import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  createGET,
  createDELETE,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockGet = vi.fn()
const mockDelete = vi.fn()

vi.mock('@/services/recipe.service', () => ({
  getRecipe: (...args: unknown[]) => mockGet(...args),
  deleteRecipe: (...args: unknown[]) => mockDelete(...args),
}))

import { GET, DELETE } from '@/app/api/recipes/[id]/route'

const FAKE_RECIPE = {
  id: 'recipe_abc',
  userId: 'db_user_123',
  outputType: 'IMAGE',
  name: 'My Recipe',
  compiledPrompt: 'a beautiful sunset',
  negativePrompt: null,
  modelId: 'flux-2-pro',
  provider: 'fal',
  version: 1,
  isDeleted: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

const FAKE_CONTEXT = {
  params: Promise.resolve({ id: 'recipe_abc' }),
}

describe('GET /api/recipes/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockGet.mockResolvedValue(FAKE_RECIPE)
  })

  it('returns 401 for unauthenticated requests', async () => {
    mockUnauthenticated()
    const req = createGET('/api/recipes/recipe_abc')
    const res = await GET(req, FAKE_CONTEXT)
    expect(res.status).toBe(401)
  })

  it('returns 404 when recipe is not found', async () => {
    mockGet.mockResolvedValue(null)
    const req = createGET('/api/recipes/recipe_missing')
    const res = await GET(req, {
      params: Promise.resolve({ id: 'recipe_missing' }),
    })
    expect(res.status).toBe(404)
  })

  it('returns 200 with the recipe on success', async () => {
    const req = createGET('/api/recipes/recipe_abc')
    const res = await GET(req, FAKE_CONTEXT)
    const body = await parseJSON<{
      success: boolean
      data: typeof FAKE_RECIPE
    }>(res)
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.id).toBe('recipe_abc')
  })
})

describe('DELETE /api/recipes/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockDelete.mockResolvedValue(true)
  })

  it('returns 401 for unauthenticated requests', async () => {
    mockUnauthenticated()
    const req = createDELETE('/api/recipes/recipe_abc')
    const res = await DELETE(req, FAKE_CONTEXT)
    expect(res.status).toBe(401)
  })

  it('returns 404 when recipe is not found', async () => {
    mockDelete.mockResolvedValue(false)
    const req = createDELETE('/api/recipes/recipe_missing')
    const res = await DELETE(req, {
      params: Promise.resolve({ id: 'recipe_missing' }),
    })
    expect(res.status).toBe(404)
  })

  it('returns 200 on successful deletion', async () => {
    const req = createDELETE('/api/recipes/recipe_abc')
    const res = await DELETE(req, FAKE_CONTEXT)
    const body = await parseJSON<{ success: boolean; data: null }>(res)
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
  })
})
