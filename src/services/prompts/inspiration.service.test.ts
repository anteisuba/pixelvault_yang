import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockEnsureUser = vi.fn()
vi.mock('@/services/user.service', () => ({
  ensureUser: (...a: unknown[]) => mockEnsureUser(...a),
}))

const mockFindMany = vi.fn()
const mockFindUnique = vi.fn()
const mockCount = vi.fn()
const mockRecipeCreate = vi.fn()
vi.mock('@/lib/db', () => ({
  db: {
    inspirationPrompt: {
      findMany: (...a: unknown[]) => mockFindMany(...a),
      findUnique: (...a: unknown[]) => mockFindUnique(...a),
      count: (...a: unknown[]) => mockCount(...a),
    },
    recipe: {
      create: (...a: unknown[]) => mockRecipeCreate(...a),
    },
  },
}))

import {
  cloneInspirationToRecipe,
  getInspirationById,
  listInspirations,
} from '@/services/prompts/inspiration.service'
import { ApiRequestError } from '@/lib/errors'

const FAKE_USER = { id: 'db_user_1', clerkId: 'clerk_1' }

const FAKE_INSPIRATION = {
  id: 'insp_1',
  source: 'meigen',
  rank: 1,
  prompt:
    'A technical infographic of a futuristic device with isometric perspective',
  author: 'TechieBySA',
  authorName: 'TechieSA',
  likes: 100,
  views: 5000,
  imageUrl: 'https://images.meigen.ai/tweets/1/0.jpg',
  modelHint: 'gptimage',
  categories: ['UI & Graphic'],
  sourceUrl: 'https://x.com/TechieBySA/status/1',
  rating: 3,
  score: 67.76,
  publishedAt: new Date('2026-02-01'),
  isPublic: true,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('listInspirations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindMany.mockResolvedValue([FAKE_INSPIRATION])
    mockCount.mockResolvedValue(1)
  })

  it('returns inspirations + total with default pagination (rank asc)', async () => {
    const result = await listInspirations()

    expect(result.inspirations).toHaveLength(1)
    expect(result.total).toBe(1)
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isPublic: true },
        orderBy: { rank: 'asc' },
        take: 24,
        skip: 0,
      }),
    )
  })

  it('filters by category using array.has', async () => {
    await listInspirations({ category: 'UI & Graphic' })

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isPublic: true,
          categories: { has: 'UI & Graphic' },
        },
      }),
    )
  })

  it('searches by case-insensitive prompt substring', async () => {
    await listInspirations({ query: '  futuristic  ' })

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          prompt: { contains: 'futuristic', mode: 'insensitive' },
        }),
      }),
    )
  })

  it('respects sortBy variants', async () => {
    const expectations: Array<
      ['likes' | 'views' | 'recent', Record<string, 'asc' | 'desc'>]
    > = [
      ['likes', { likes: 'desc' }],
      ['views', { views: 'desc' }],
      ['recent', { publishedAt: 'desc' }],
    ]

    for (const [sortBy, expected] of expectations) {
      mockFindMany.mockClear()
      await listInspirations({ sortBy })
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: expected }),
      )
    }
  })

  it('caps limit at 60 and floors negative offset to 0', async () => {
    await listInspirations({ limit: 999, offset: -50 })

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 60, skip: 0 }),
    )
  })
})

describe('getInspirationById', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the row when found and public', async () => {
    mockFindUnique.mockResolvedValue(FAKE_INSPIRATION)

    const result = await getInspirationById('insp_1')

    expect(result).toEqual(FAKE_INSPIRATION)
  })

  it('returns null when not found', async () => {
    mockFindUnique.mockResolvedValue(null)

    const result = await getInspirationById('missing')

    expect(result).toBeNull()
  })

  it('returns null when soft-hidden (isPublic=false)', async () => {
    mockFindUnique.mockResolvedValue({ ...FAKE_INSPIRATION, isPublic: false })

    const result = await getInspirationById('insp_1')

    expect(result).toBeNull()
  })
})

describe('cloneInspirationToRecipe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
  })

  it('creates a Recipe with the inspiration prompt + attribution metadata', async () => {
    mockFindUnique.mockResolvedValue(FAKE_INSPIRATION)
    mockRecipeCreate.mockResolvedValue({ id: 'recipe_1' })

    const recipe = await cloneInspirationToRecipe('clerk_1', 'insp_1')

    expect(recipe).toEqual({ id: 'recipe_1' })
    expect(mockRecipeCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: FAKE_USER.id,
        compiledPrompt: FAKE_INSPIRATION.prompt,
        modelId: 'gpt-image-2',
        provider: 'OpenAI',
        outputType: 'IMAGE',
        userIntent: expect.objectContaining({
          source: 'inspiration',
          inspirationId: 'insp_1',
          author: 'TechieBySA',
          authorName: 'TechieSA',
          sourceUrl: 'https://x.com/TechieBySA/status/1',
        }),
      }),
    })
  })

  it('throws ApiRequestError(404) when the inspiration is missing', async () => {
    mockFindUnique.mockResolvedValue(null)

    await expect(
      cloneInspirationToRecipe('clerk_1', 'missing'),
    ).rejects.toThrow(ApiRequestError)

    expect(mockRecipeCreate).not.toHaveBeenCalled()
  })

  it('throws ApiRequestError(404) when the inspiration is hidden', async () => {
    mockFindUnique.mockResolvedValue({ ...FAKE_INSPIRATION, isPublic: false })

    await expect(cloneInspirationToRecipe('clerk_1', 'insp_1')).rejects.toThrow(
      ApiRequestError,
    )
  })

  it('respects overrides for model / provider / outputType', async () => {
    mockFindUnique.mockResolvedValue(FAKE_INSPIRATION)
    mockRecipeCreate.mockResolvedValue({ id: 'recipe_2' })

    await cloneInspirationToRecipe('clerk_1', 'insp_1', {
      modelId: 'flux-2-pro',
      provider: 'fal.ai',
      outputType: 'IMAGE',
    })

    expect(mockRecipeCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        modelId: 'flux-2-pro',
        provider: 'fal.ai',
        outputType: 'IMAGE',
      }),
    })
  })

  it('truncates long prompts into a tidy Recipe name', async () => {
    const longPrompt = 'a'.repeat(200)
    mockFindUnique.mockResolvedValue({
      ...FAKE_INSPIRATION,
      prompt: longPrompt,
    })
    mockRecipeCreate.mockResolvedValue({ id: 'recipe_3' })

    await cloneInspirationToRecipe('clerk_1', 'insp_1')

    const name = mockRecipeCreate.mock.calls[0]?.[0]?.data?.name as string
    expect(name.length).toBeLessThanOrEqual(48)
    expect(name.endsWith('...')).toBe(true)
  })
})
