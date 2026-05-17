import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { GenerationRecord } from '@/types'

const mockPreferenceFindUnique = vi.fn()
const mockPreferenceUpsert = vi.fn()
const mockGenerationFindMany = vi.fn()
const mockRecipeFindMany = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    userCreativePreference: {
      findUnique: (...args: unknown[]) => mockPreferenceFindUnique(...args),
      upsert: (...args: unknown[]) => mockPreferenceUpsert(...args),
    },
    generation: {
      findMany: (...args: unknown[]) => mockGenerationFindMany(...args),
    },
    recipe: {
      findMany: (...args: unknown[]) => mockRecipeFindMany(...args),
    },
  },
}))

import {
  getUserPreference,
  updatePreferenceOnDeleted,
  updatePreferenceOnRecipeSaved,
  updatePreferenceOnSatisfied,
} from '@/services/user-preference.service'

const BASE_GENERATION: GenerationRecord = {
  id: 'gen-current',
  createdAt: new Date('2026-05-04T10:00:00.000Z'),
  outputType: 'IMAGE',
  status: 'COMPLETED',
  url: 'https://example.com/current.png',
  storageKey: 'current.png',
  mimeType: 'image/png',
  width: 1024,
  height: 1024,
  duration: null,
  referenceImageUrl: null,
  prompt: 'anime portrait',
  negativePrompt: null,
  model: 'model-a',
  provider: 'fal',
  requestCount: 1,
  isPublic: false,
  isPromptPublic: false,
  isFeatured: false,
  userId: 'user-1',
  snapshot: {
    intent: {
      subject: 'portrait of a character',
      style: 'anime illustration',
    },
    aspectRatio: '1:1',
  },
}

const EXISTING_PREFERENCE = {
  id: 'pref-1',
  userId: 'user-1',
  favoriteStyles: ['watercolor'],
  rejectedStyles: ['low-poly'],
  preferredModelsByTask: { general: ['model-old'] },
  commonNegativeTags: ['blur'],
  preferredAspectRatios: ['16:9'],
  createdAt: new Date('2026-05-01T00:00:00.000Z'),
  updatedAt: new Date('2026-05-02T00:00:00.000Z'),
}

function recentGeneration(
  id: string,
  createdAt: string,
  model: string,
  style: string,
) {
  return {
    id,
    createdAt: new Date(createdAt),
    prompt: `${style} portrait`,
    negativePrompt: null,
    model,
    snapshot: {
      intent: {
        subject: 'portrait of a character',
        style,
      },
      aspectRatio: '1:1',
    },
  }
}

describe('user-preference.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPreferenceFindUnique.mockResolvedValue(null)
    mockPreferenceUpsert.mockResolvedValue(EXISTING_PREFERENCE)
    mockGenerationFindMany.mockResolvedValue([])
    mockRecipeFindMany.mockResolvedValue([])
  })

  it('returns an existing user preference', async () => {
    mockPreferenceFindUnique.mockResolvedValue(EXISTING_PREFERENCE)

    const result = await getUserPreference('user-1')

    expect(result).toEqual(EXISTING_PREFERENCE)
    expect(mockPreferenceFindUnique).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    })
  })

  it('returns null when a user preference does not exist', async () => {
    mockPreferenceFindUnique.mockResolvedValue(null)

    await expect(getUserPreference('user-1')).resolves.toBeNull()
  })

  it('creates preference data when a satisfied generation has repeated style signals', async () => {
    mockGenerationFindMany.mockResolvedValue([
      recentGeneration(
        'gen-2',
        '2026-05-04T09:00:00.000Z',
        'model-a',
        'anime illustration',
      ),
      recentGeneration(
        'gen-3',
        '2026-05-04T08:00:00.000Z',
        'model-b',
        'anime illustration',
      ),
    ])

    await updatePreferenceOnSatisfied('user-1', BASE_GENERATION)

    expect(mockPreferenceUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        create: expect.objectContaining({
          favoriteStyles: ['anime illustration'],
          preferredAspectRatios: ['1:1'],
          preferredModelsByTask: expect.objectContaining({
            anime: expect.arrayContaining(['model-a']),
          }),
        }),
      }),
    )
  })

  it('queries only explicit satisfied generation history', async () => {
    await updatePreferenceOnSatisfied('user-1', BASE_GENERATION)

    expect(mockGenerationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          outputType: 'IMAGE',
          evaluation: {
            path: ['userSatisfied'],
            equals: true,
          },
        }),
        take: 20,
      }),
    )
    expect(mockGenerationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({
          status: 'COMPLETED',
        }),
      }),
    )
  })

  it('deduplicates repeated satisfied clicks for the same generation', async () => {
    mockGenerationFindMany.mockResolvedValue([
      recentGeneration(
        'gen-current',
        '2026-05-04T10:00:00.000Z',
        'model-a',
        'anime illustration',
      ),
      recentGeneration(
        'gen-2',
        '2026-05-04T09:00:00.000Z',
        'model-a',
        'anime illustration',
      ),
    ])

    await updatePreferenceOnSatisfied('user-1', BASE_GENERATION)

    expect(mockPreferenceUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          favoriteStyles: [],
        }),
      }),
    )
  })

  it('updates preference data while preserving existing rejected styles', async () => {
    mockPreferenceFindUnique.mockResolvedValue(EXISTING_PREFERENCE)
    mockGenerationFindMany.mockResolvedValue([
      recentGeneration(
        'gen-2',
        '2026-05-04T09:00:00.000Z',
        'model-a',
        'anime illustration',
      ),
      recentGeneration(
        'gen-3',
        '2026-05-04T08:00:00.000Z',
        'model-a',
        'anime illustration',
      ),
    ])

    await updatePreferenceOnSatisfied('user-1', BASE_GENERATION)

    expect(mockPreferenceUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          rejectedStyles: ['low-poly'],
          favoriteStyles: ['anime illustration'],
        }),
      }),
    )
  })

  it('adds deleted generation style to rejectedStyles', async () => {
    mockPreferenceFindUnique.mockResolvedValue(EXISTING_PREFERENCE)

    await updatePreferenceOnDeleted('user-1', {
      ...BASE_GENERATION,
      snapshot: {
        intent: {
          subject: 'product image',
          style: 'photorealistic',
        },
      },
    })

    expect(mockPreferenceUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          rejectedStyles: ['photorealistic', 'low-poly'],
        }),
      }),
    )
  })

  it('updates recipe-derived negative prompt preferences', async () => {
    mockRecipeFindMany.mockResolvedValue([
      {
        id: 'recipe-2',
        modelId: 'model-a',
        negativePrompt: 'blur, low quality',
        compiledPrompt: 'anime portrait',
        userIntent: {
          subject: 'portrait of a character',
          style: 'anime illustration',
        },
      },
      {
        id: 'recipe-3',
        modelId: 'model-b',
        negativePrompt: 'bad hands',
        compiledPrompt: 'anime portrait',
        userIntent: {
          subject: 'portrait of a character',
          style: 'anime illustration',
        },
      },
    ])

    await updatePreferenceOnRecipeSaved('user-1', {
      id: 'recipe-1',
      userId: 'user-1',
      outputType: 'IMAGE',
      name: 'Recipe',
      userIntent: null,
      compiledPrompt: 'anime portrait',
      negativePrompt: 'blur, bad hands',
      modelId: 'model-a',
      provider: 'fal',
      params: null,
      referenceAssets: null,
      seed: null,
      parentGenerationId: null,
      version: 1,
      evaluationSummary: null,
      isDeleted: false,
      createdAt: new Date('2026-05-04T10:00:00.000Z'),
      updatedAt: new Date('2026-05-04T10:00:00.000Z'),
    })

    expect(mockPreferenceUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          commonNegativeTags: ['bad hands', 'blur'],
          preferredModelsByTask: expect.objectContaining({
            portrait: ['model-a'],
          }),
        }),
      }),
    )
  })
})
