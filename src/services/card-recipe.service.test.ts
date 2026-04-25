import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockEnsureUser = vi.fn()
vi.mock('@/services/user.service', () => ({
  ensureUser: (...a: unknown[]) => mockEnsureUser(...a),
}))

const mockFindMany = vi.fn()
const mockFindFirst = vi.fn()
const mockCreate = vi.fn()
const mockUpdateMany = vi.fn()
const mockCount = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    cardRecipe: {
      findMany: (...a: unknown[]) => mockFindMany(...a),
      findFirst: (...a: unknown[]) => mockFindFirst(...a),
      create: (...a: unknown[]) => mockCreate(...a),
      updateMany: (...a: unknown[]) => mockUpdateMany(...a),
      count: (...a: unknown[]) => mockCount(...a),
    },
  },
}))

import {
  listCardRecipes,
  getCardRecipe,
  createCardRecipe,
  deleteCardRecipe,
} from '@/services/card-recipe.service'

const FAKE_USER = { id: 'db_user_1', clerkId: 'clerk_1' }
const FAKE_ROW = {
  id: 'recipe_1',
  name: 'My Recipe',
  characterCardId: null,
  backgroundCardId: null,
  styleCardId: 'style_1',
  freePrompt: 'running in rain',
  projectId: null,
  isDeleted: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  characterCard: null,
  backgroundCard: null,
  styleCard: { id: 'style_1', name: 'Watercolor' },
}

describe('listCardRecipes', () => {
  it('returns a list of card recipes', async () => {
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockFindMany.mockResolvedValue([FAKE_ROW])
    const result = await listCardRecipes('clerk_1')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('My Recipe')
  })
})

describe('getCardRecipe', () => {
  it('returns null when recipe not found', async () => {
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockFindFirst.mockResolvedValue(null)
    const result = await getCardRecipe('clerk_1', 'missing')
    expect(result).toBeNull()
  })
})

describe('createCardRecipe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockCount.mockResolvedValue(0)
    mockCreate.mockResolvedValue(FAKE_ROW)
  })

  it('creates a card recipe and returns a record', async () => {
    const result = await createCardRecipe('clerk_1', {
      name: 'My Recipe',
      styleCardId: 'style_1',
      freePrompt: 'running in rain',
    })
    expect(result.name).toBe('My Recipe')
    expect(mockCreate).toHaveBeenCalled()
  })
})

describe('deleteCardRecipe', () => {
  it('soft-deletes recipes owned by the user', async () => {
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockUpdateMany.mockResolvedValue({ count: 1 })
    await deleteCardRecipe('clerk_1', 'recipe_1')
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: 'recipe_1', userId: 'db_user_1', isDeleted: false },
      data: { isDeleted: true },
    })
  })
})
