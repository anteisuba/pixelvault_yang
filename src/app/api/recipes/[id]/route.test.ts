import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  createGET,
  createPATCH,
  createDELETE,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockGet = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()

vi.mock('@/services/prompts/recipe.service', () => ({
  getRecipe: (...args: unknown[]) => mockGet(...args),
  updateRecipe: (...args: unknown[]) => mockUpdate(...args),
  deleteRecipe: (...args: unknown[]) => mockDelete(...args),
}))

import { GET, PATCH, DELETE } from '@/app/api/recipes/[id]/route'

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

const UPDATE_INPUT = {
  name: 'Updated Recipe',
  outputType: 'IMAGE' as const,
  compiledPrompt: 'an updated sunset prompt',
  modelId: 'flux-2-pro',
  provider: 'fal',
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

describe('PATCH /api/recipes/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthenticated()
    mockUpdate.mockResolvedValue({
      ...FAKE_RECIPE,
      ...UPDATE_INPUT,
      version: 2,
    })
  })

  it('returns 401 for unauthenticated requests', async () => {
    mockUnauthenticated()
    const req = createPATCH('/api/recipes/recipe_abc', UPDATE_INPUT)
    const res = await PATCH(req, FAKE_CONTEXT)
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid payloads', async () => {
    const req = createPATCH('/api/recipes/recipe_abc', {
      ...UPDATE_INPUT,
      compiledPrompt: '',
    })
    const res = await PATCH(req, FAKE_CONTEXT)
    expect(res.status).toBe(400)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('returns 404 when recipe is not found', async () => {
    mockUpdate.mockResolvedValue(null)
    const req = createPATCH('/api/recipes/recipe_missing', UPDATE_INPUT)
    const res = await PATCH(req, {
      params: Promise.resolve({ id: 'recipe_missing' }),
    })
    expect(res.status).toBe(404)
  })

  it('updates the recipe on success', async () => {
    const req = createPATCH('/api/recipes/recipe_abc', UPDATE_INPUT)
    const res = await PATCH(req, FAKE_CONTEXT)
    const body = await parseJSON<{
      success: boolean
      data: typeof FAKE_RECIPE
    }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.version).toBe(2)
    expect(mockUpdate).toHaveBeenCalledWith(
      'clerk_test_user',
      'recipe_abc',
      expect.objectContaining({
        compiledPrompt: 'an updated sunset prompt',
        modelId: 'flux-2-pro',
      }),
    )
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
