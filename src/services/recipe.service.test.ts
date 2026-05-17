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
const mockGenerationFindFirst = vi.fn()
const mockGenerationFindMany = vi.fn()
const mockUpdatePreferenceOnRecipeSaved = vi.fn()

vi.mock('@/services/user.service', () => ({
  ensureUser: (...args: unknown[]) => mockEnsureUser(...args),
}))

vi.mock('@/services/user-preference.service', () => ({
  updatePreferenceOnRecipeSaved: (...args: unknown[]) =>
    mockUpdatePreferenceOnRecipeSaved(...args),
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
    generation: {
      findFirst: (...args: unknown[]) => mockGenerationFindFirst(...args),
      findMany: (...args: unknown[]) => mockGenerationFindMany(...args),
    },
  },
}))

import {
  buildRecipeSnapshotForUser,
  createRecipeFromGeneration,
  createRecipe,
  updateRecipe,
  listRecipeGenerations,
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
  params: null,
  referenceAssets: null,
  parentGenerationId: 'gen_source',
  version: 1,
  isDeleted: false,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const FAKE_GENERATION = {
  id: 'gen_source',
  userId: 'db_user_123',
  createdAt: new Date(),
  outputType: 'IMAGE',
  status: 'COMPLETED',
  url: 'https://cdn.example.com/image.png',
  storageKey: 'storage/key.png',
  mimeType: 'image/png',
  thumbnailUrl: null,
  thumbnailStorageKey: null,
  previewUrl: null,
  previewStorageKey: null,
  width: 1024,
  height: 1024,
  duration: null,
  referenceImageUrl: 'https://cdn.example.com/ref.png',
  modelUrl: null,
  modelStorageKey: null,
  prompt: 'A useful prompt',
  negativePrompt: 'low quality',
  model: 'flux-2-pro',
  provider: 'fal',
  requestCount: 2,
  isFreeGeneration: false,
  isPublic: false,
  isPromptPublic: false,
  isFeatured: false,
  projectId: null,
  characterCardId: null,
  cardRecipeId: null,
  snapshot: {
    compiledPrompt: 'A useful prompt',
    modelId: 'flux-2-pro',
    aspectRatio: '16:9',
    advancedParams: { seed: 123 },
    referenceImages: ['https://cdn.example.com/ref.png'],
  },
  seed: BigInt(123),
  runGroupId: null,
  runGroupType: 'single',
  runGroupIndex: 0,
  isWinner: null,
}

const VALID_INPUT = {
  compiledPrompt: 'a beautiful sunset',
  modelId: 'flux-2-pro',
  provider: 'fal',
  name: '',
  outputType: 'IMAGE' as const,
}

const UPDATE_INPUT = {
  compiledPrompt: 'an updated sunset prompt',
  negativePrompt: 'blurry',
  modelId: 'flux-2-pro',
  provider: 'fal',
  name: 'Updated Recipe',
  outputType: 'IMAGE' as const,
  parentGenerationId: 'gen_source',
}

describe('createRecipe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockCreate.mockResolvedValue(FAKE_RECIPE)
    mockUpdatePreferenceOnRecipeSaved.mockResolvedValue(undefined)
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

  it('updates creative preference after creating a recipe', async () => {
    await createRecipe('clerk_test_user', VALID_INPUT)

    expect(mockUpdatePreferenceOnRecipeSaved).toHaveBeenCalledWith(
      'db_user_123',
      FAKE_RECIPE,
    )
  })

  it('returns the recipe when preference update fails', async () => {
    mockUpdatePreferenceOnRecipeSaved.mockRejectedValueOnce(
      new Error('preference unavailable'),
    )

    await expect(createRecipe('clerk_test_user', VALID_INPUT)).resolves.toEqual(
      FAKE_RECIPE,
    )
  })
})

describe('updateRecipe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockFindFirst.mockResolvedValue(FAKE_RECIPE)
    mockUpdate.mockResolvedValue({
      ...FAKE_RECIPE,
      ...UPDATE_INPUT,
      version: 2,
    })
    mockUpdatePreferenceOnRecipeSaved.mockResolvedValue(undefined)
  })

  it('updates an owned non-deleted recipe and increments the version', async () => {
    const result = await updateRecipe(
      'clerk_test_user',
      'recipe_abc',
      UPDATE_INPUT,
    )

    expect(result?.version).toBe(2)
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: {
        id: 'recipe_abc',
        userId: 'db_user_123',
        isDeleted: false,
      },
    })
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'recipe_abc' },
      data: expect.objectContaining({
        name: 'Updated Recipe',
        compiledPrompt: 'an updated sunset prompt',
        negativePrompt: 'blurry',
        modelId: 'flux-2-pro',
        provider: 'fal',
        parentGenerationId: 'gen_source',
        version: { increment: 1 },
      }),
    })
  })

  it('updates creative preference after editing a recipe', async () => {
    const result = await updateRecipe(
      'clerk_test_user',
      'recipe_abc',
      UPDATE_INPUT,
    )

    expect(mockUpdatePreferenceOnRecipeSaved).toHaveBeenCalledWith(
      'db_user_123',
      result,
    )
  })

  it('returns null when the recipe is not owned by the user', async () => {
    mockFindFirst.mockResolvedValueOnce(null)

    const result = await updateRecipe(
      'clerk_test_user',
      'recipe_missing',
      UPDATE_INPUT,
    )

    expect(result).toBeNull()
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})

describe('createRecipeFromGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockGenerationFindFirst.mockResolvedValue(FAKE_GENERATION)
    mockCreate.mockResolvedValue(FAKE_RECIPE)
    mockUpdatePreferenceOnRecipeSaved.mockResolvedValue(undefined)
  })

  it('creates a recipe from a generation owned by the user', async () => {
    await createRecipeFromGeneration('clerk_test_user', {
      generationId: 'gen_source',
    })

    expect(mockGenerationFindFirst).toHaveBeenCalledWith({
      where: {
        id: 'gen_source',
        userId: 'db_user_123',
      },
    })
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'db_user_123',
          outputType: 'IMAGE',
          compiledPrompt: 'A useful prompt',
          negativePrompt: 'low quality',
          modelId: 'flux-2-pro',
          provider: 'fal',
          parentGenerationId: 'gen_source',
          params: {
            aspectRatio: '16:9',
            advancedParams: { seed: 123 },
          },
          referenceAssets: [
            { url: 'https://cdn.example.com/ref.png', role: 'composition' },
          ],
          seed: BigInt(123),
        }),
      }),
    )
  })

  it('uses the supplied name when provided', async () => {
    await createRecipeFromGeneration('clerk_test_user', {
      generationId: 'gen_source',
      name: 'Hero prompt',
    })

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Hero prompt' }),
      }),
    )
  })

  it('throws when the source generation is not found', async () => {
    mockGenerationFindFirst.mockResolvedValueOnce(null)

    await expect(
      createRecipeFromGeneration('clerk_test_user', {
        generationId: 'missing',
      }),
    ).rejects.toMatchObject({
      errorCode: 'GENERATION_NOT_FOUND',
      httpStatus: 404,
    })
  })
})

describe('buildRecipeSnapshotForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindFirst.mockResolvedValue(FAKE_RECIPE)
  })

  it('builds a reusable lineage snapshot for a user recipe', async () => {
    const snapshot = await buildRecipeSnapshotForUser('db_user_123', {
      recipeId: 'recipe_abc',
      recipeVersion: 1,
      useMode: 'apply',
    })

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: {
        id: 'recipe_abc',
        userId: 'db_user_123',
        isDeleted: false,
      },
    })
    expect(snapshot).toEqual(
      expect.objectContaining({
        sourceType: 'prompt_template',
        recipeId: 'recipe_abc',
        recipeVersion: 1,
        useMode: 'apply',
        compiledPrompt: 'a beautiful sunset',
        parentGenerationId: 'gen_source',
      }),
    )
  })

  it('throws when the recipe is not available to the user', async () => {
    mockFindFirst.mockResolvedValueOnce(null)

    await expect(
      buildRecipeSnapshotForUser('db_user_123', {
        recipeId: 'missing',
        useMode: 'apply',
      }),
    ).rejects.toMatchObject({
      errorCode: 'RECIPE_NOT_FOUND',
      httpStatus: 404,
    })
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

describe('listRecipeGenerations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockFindFirst.mockResolvedValue(FAKE_RECIPE)
    mockGenerationFindMany.mockResolvedValue([FAKE_GENERATION])
  })

  it('returns source and derived generations for a recipe', async () => {
    const result = await listRecipeGenerations('clerk_test_user', 'recipe_abc')

    expect(result).toHaveLength(1)
    expect(mockGenerationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'db_user_123',
          OR: expect.arrayContaining([
            { id: 'gen_source' },
            {
              recipeSnapshot: {
                path: ['recipeId'],
                equals: 'recipe_abc',
              },
            },
          ]),
        }),
      }),
    )
  })

  it('returns an empty list when the recipe does not belong to the user', async () => {
    mockFindFirst.mockResolvedValueOnce(null)

    const result = await listRecipeGenerations('clerk_test_user', 'missing')

    expect(result).toEqual([])
    expect(mockGenerationFindMany).not.toHaveBeenCalled()
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
