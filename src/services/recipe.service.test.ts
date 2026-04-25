import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockEnsureUser = vi.fn()
const mockCreate = vi.fn()
const mockFindMany = vi.fn()
const mockCount = vi.fn()
const mockFindFirst = vi.fn()
const mockUpdate = vi.fn()

vi.mock('@/services/user.service', () => ({
  ensureUser: (...args: unknown[]) => mockEnsureUser(...args),
}))

vi.mock('@/lib/db', () => ({
  db: {
    recipe: {
      create: (...args: unknown[]) => mockCreate(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}))

import {
  createRecipe,
  listRecipes,
  getRecipe,
  deleteRecipe,
} from '@/services/recipe.service'

const FAKE_USER = { id: 'db_user_123', clerkId: 'clerk_test_user' }

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
  createdAt: new Date(),
  updatedAt: new Date(),
}

const VALID_INPUT = {
  compiledPrompt: 'a beautiful sunset',
  modelId: 'flux-2-pro',
  provider: 'fal',
  name: '',
  outputType: 'IMAGE' as const,
}

describe('createRecipe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockCreate.mockResolvedValue(FAKE_RECIPE)
  })

  it('calls db.recipe.create with the user id and input', async () => {
    await createRecipe('clerk_test_user', VALID_INPUT)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'db_user_123',
          compiledPrompt: 'a beautiful sunset',
          modelId: 'flux-2-pro',
        }),
      }),
    )
  })

  it('returns the created recipe record', async () => {
    const result = await createRecipe('clerk_test_user', VALID_INPUT)
    expect(result.id).toBe('recipe_abc')
  })
})

describe('listRecipes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockFindMany.mockResolvedValue([FAKE_RECIPE])
    mockCount.mockResolvedValue(1)
  })

  it('returns paginated recipes and total count', async () => {
    const result = await listRecipes('clerk_test_user', 1, 20)
    expect(result.recipes).toHaveLength(1)
    expect(result.total).toBe(1)
  })

  it('queries only non-deleted recipes for the user', async () => {
    await listRecipes('clerk_test_user', 1, 20)
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'db_user_123',
          isDeleted: false,
        }),
      }),
    )
  })
})

describe('getRecipe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockFindFirst.mockResolvedValue(FAKE_RECIPE)
  })

  it('returns the recipe when found', async () => {
    const result = await getRecipe('clerk_test_user', 'recipe_abc')
    expect(result?.id).toBe('recipe_abc')
  })

  it('returns null when db returns null', async () => {
    mockFindFirst.mockResolvedValue(null)
    const result = await getRecipe('clerk_test_user', 'recipe_missing')
    expect(result).toBeNull()
  })
})

describe('deleteRecipe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockFindFirst.mockResolvedValue(FAKE_RECIPE)
    mockUpdate.mockResolvedValue({ ...FAKE_RECIPE, isDeleted: true })
  })

  it('soft-deletes the recipe and returns true', async () => {
    const result = await deleteRecipe('clerk_test_user', 'recipe_abc')
    expect(result).toBe(true)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'recipe_abc' },
        data: { isDeleted: true },
      }),
    )
  })

  it('returns false when recipe is not found', async () => {
    mockFindFirst.mockResolvedValue(null)
    const result = await deleteRecipe('clerk_test_user', 'recipe_missing')
    expect(result).toBe(false)
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
