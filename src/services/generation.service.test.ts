import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGenerationCreate = vi.hoisted(() => vi.fn())
const mockGenerationFindMany = vi.hoisted(() => vi.fn())
const mockGenerationFindUnique = vi.hoisted(() => vi.fn())
const mockGenerationFindFirst = vi.hoisted(() => vi.fn())
const mockGenerationCount = vi.hoisted(() => vi.fn())
const mockGenerationGroupBy = vi.hoisted(() => vi.fn())
const mockGenerationUpdate = vi.hoisted(() => vi.fn())
const mockGenerationUpdateMany = vi.hoisted(() => vi.fn())
const mockGenerationDelete = vi.hoisted(() => vi.fn())
const mockGenerationDeleteMany = vi.hoisted(() => vi.fn())
const mockGenerationCharacterCardCreateMany = vi.hoisted(() => vi.fn())
const mockDbTransaction = vi.hoisted(() => vi.fn())
const mockUpdatePreferenceOnDeleted = vi.hoisted(() => vi.fn())

vi.mock('@/services/user-preference.service', () => ({
  updatePreferenceOnDeleted: (...args: unknown[]) =>
    mockUpdatePreferenceOnDeleted(...args),
}))

vi.mock('@/lib/db', () => ({
  db: {
    generation: {
      create: (...args: unknown[]) => mockGenerationCreate(...args),
      findMany: (...args: unknown[]) => mockGenerationFindMany(...args),
      findUnique: (...args: unknown[]) => mockGenerationFindUnique(...args),
      findFirst: (...args: unknown[]) => mockGenerationFindFirst(...args),
      count: (...args: unknown[]) => mockGenerationCount(...args),
      groupBy: (...args: unknown[]) => mockGenerationGroupBy(...args),
      update: (...args: unknown[]) => mockGenerationUpdate(...args),
      updateMany: (...args: unknown[]) => mockGenerationUpdateMany(...args),
      delete: (...args: unknown[]) => mockGenerationDelete(...args),
      deleteMany: (...args: unknown[]) => mockGenerationDeleteMany(...args),
    },
    generationCharacterCard: {
      createMany: (...args: unknown[]) =>
        mockGenerationCharacterCardCreateMany(...args),
    },
    $transaction: (...args: unknown[]) => mockDbTransaction(...args),
  },
}))

import {
  batchDeleteGenerations,
  batchUpdateVisibility,
  countPublicGenerations,
  countUserGenerationsByType,
  createGeneration,
  deleteGeneration,
  getAssetSectionCounts,
  getGenerationById,
  getGenerationsByCharacterCombination,
  getPublicGenerations,
  getUserGenerations,
  selectVariantWinner,
  toggleGenerationVisibility,
} from './generation.service'

const BASE_GENERATION = {
  id: 'gen-1',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  outputType: 'IMAGE',
  status: 'COMPLETED',
  url: 'https://cdn.example.com/gen.png',
  storageKey: 'generations/gen.png',
  mimeType: 'image/png',
  width: 1024,
  height: 1024,
  duration: null,
  referenceImageUrl: null,
  prompt: 'Visible prompt',
  negativePrompt: 'negative',
  model: 'sdxl',
  provider: 'huggingface',
  requestCount: 1,
  isFreeGeneration: false,
  isPublic: true,
  isPromptPublic: true,
  isFeatured: false,
  userId: 'user-1',
}

describe('generation.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdatePreferenceOnDeleted.mockResolvedValue(undefined)
    mockDbTransaction.mockImplementation(
      async (
        fn: (tx: {
          generation: {
            findFirst: typeof mockGenerationFindFirst
            updateMany: typeof mockGenerationUpdateMany
            update: typeof mockGenerationUpdate
          }
        }) => Promise<unknown>,
      ) =>
        fn({
          generation: {
            findFirst: mockGenerationFindFirst,
            updateMany: mockGenerationUpdateMany,
            update: mockGenerationUpdate,
          },
        }),
    )
  })

  describe('createGeneration', () => {
    it('persists a completed generation with defaults', async () => {
      mockGenerationCreate.mockResolvedValue(BASE_GENERATION)

      const result = await createGeneration({
        url: BASE_GENERATION.url,
        storageKey: BASE_GENERATION.storageKey,
        mimeType: BASE_GENERATION.mimeType,
        width: BASE_GENERATION.width,
        height: BASE_GENERATION.height,
        prompt: BASE_GENERATION.prompt,
        model: BASE_GENERATION.model,
        provider: BASE_GENERATION.provider,
        requestCount: 1,
        userId: 'user-1',
      })

      expect(result).toBe(BASE_GENERATION)
      expect(mockGenerationCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          outputType: 'IMAGE',
          isFreeGeneration: false,
          isPublic: false,
          isPromptPublic: false,
          runGroupType: 'single',
          runGroupIndex: 0,
        }),
      })
      expect(mockGenerationCharacterCardCreateMany).not.toHaveBeenCalled()
    })

    it('links character cards when characterCardIds are provided', async () => {
      mockGenerationCreate.mockResolvedValue({
        ...BASE_GENERATION,
        id: 'gen-2',
      })

      await createGeneration({
        url: BASE_GENERATION.url,
        storageKey: BASE_GENERATION.storageKey,
        mimeType: BASE_GENERATION.mimeType,
        width: BASE_GENERATION.width,
        height: BASE_GENERATION.height,
        prompt: BASE_GENERATION.prompt,
        model: BASE_GENERATION.model,
        provider: BASE_GENERATION.provider,
        requestCount: 1,
        characterCardIds: ['card-1', 'card-2'],
      })

      expect(mockGenerationCharacterCardCreateMany).toHaveBeenCalledWith({
        data: [
          { generationId: 'gen-2', characterCardId: 'card-1' },
          { generationId: 'gen-2', characterCardId: 'card-2' },
        ],
      })
    })

    it('propagates database create failures', async () => {
      mockGenerationCreate.mockRejectedValue(new Error('create failed'))

      await expect(
        createGeneration({
          url: BASE_GENERATION.url,
          storageKey: BASE_GENERATION.storageKey,
          mimeType: BASE_GENERATION.mimeType,
          width: BASE_GENERATION.width,
          height: BASE_GENERATION.height,
          prompt: BASE_GENERATION.prompt,
          model: BASE_GENERATION.model,
          provider: BASE_GENERATION.provider,
          requestCount: 1,
        }),
      ).rejects.toThrow('create failed')
      expect(mockGenerationCharacterCardCreateMany).not.toHaveBeenCalled()
    })
  })

  describe('getUserGenerations', () => {
    it('uses user ownership and pagination', async () => {
      mockGenerationFindMany.mockResolvedValue([BASE_GENERATION])

      const result = await getUserGenerations('user-1', { page: 3, limit: 10 })

      expect(result[0]).toMatchObject(BASE_GENERATION)
      // List paths intentionally skip the snapshot column, so we no
      // longer derive a referenceImages array here — that lives on
      // getGenerationById which still loads the full row.
      expect(result[0].referenceImages).toBeUndefined()
      expect(mockGenerationFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          orderBy: { createdAt: 'desc' },
          skip: 20,
          take: 10,
        }),
      )
      expect(mockGenerationFindMany.mock.calls[0][0]).toHaveProperty('select')
    })

    it('propagates list query failures', async () => {
      mockGenerationFindMany.mockRejectedValue(new Error('list failed'))

      await expect(getUserGenerations('user-1')).rejects.toThrow('list failed')
    })
  })

  describe('getPublicGenerations', () => {
    it('redacts prompts for public viewers when prompt is private', async () => {
      mockGenerationFindMany.mockResolvedValue([
        {
          ...BASE_GENERATION,
          isPromptPublic: false,
          user: {
            username: 'artist',
            displayName: 'Artist',
            avatarUrl: null,
          },
          _count: { likes: 2 },
          likes: [{ id: 'like-1' }],
        },
      ])

      const result = await getPublicGenerations({
        search: 'cat',
        viewerUserId: 'viewer-1',
      })

      expect(result[0]).toMatchObject({
        prompt: '',
        negativePrompt: null,
        creator: {
          username: 'artist',
          displayName: 'Artist',
        },
        likeCount: 2,
        isLiked: true,
      })
      expect(mockGenerationFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isPublic: true,
            AND: [
              { isPromptPublic: true },
              { prompt: { contains: 'cat', mode: 'insensitive' } },
            ],
          }),
        }),
      )
    })

    it('keeps prompts for owner queries and applies owner search', async () => {
      mockGenerationFindMany.mockResolvedValue([
        {
          ...BASE_GENERATION,
          isPromptPublic: false,
          user: null,
          _count: { likes: 0 },
        },
      ])

      const result = await getPublicGenerations({
        userId: 'user-1',
        search: 'private',
      })

      expect(result[0]).toMatchObject({
        prompt: 'Visible prompt',
        negativePrompt: 'negative',
      })
      expect(mockGenerationFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user-1',
            prompt: { contains: 'private', mode: 'insensitive' },
          },
        }),
      )
    })
  })

  describe('getGenerationById', () => {
    it('finds a generation by id', async () => {
      mockGenerationFindUnique.mockResolvedValue(BASE_GENERATION)

      const result = await getGenerationById('gen-1')

      expect(result).toMatchObject(BASE_GENERATION)
      expect(result?.referenceImages).toEqual([])
      expect(mockGenerationFindUnique).toHaveBeenCalledWith({
        where: { id: 'gen-1' },
      })
    })

    it('normalizes legacy snapshot referenceImages to ReferenceAsset records', async () => {
      mockGenerationFindUnique.mockResolvedValue({
        ...BASE_GENERATION,
        snapshot: {
          referenceImages: ['https://example.com/ref.png'],
        },
      })

      const result = await getGenerationById('gen-1')

      expect(result?.referenceImages).toEqual([
        {
          url: 'https://example.com/ref.png',
          role: 'identity',
        },
      ])
    })

    it('passes through snapshot referenceAssets records', async () => {
      mockGenerationFindUnique.mockResolvedValue({
        ...BASE_GENERATION,
        snapshot: {
          referenceAssets: [
            {
              url: 'https://example.com/style.png',
              role: 'style',
              weight: 0.8,
            },
          ],
        },
      })

      const result = await getGenerationById('gen-1')

      expect(result?.referenceImages).toEqual([
        {
          url: 'https://example.com/style.png',
          role: 'style',
          weight: 0.8,
        },
      ])
    })

    it('falls back to referenceImageUrl when snapshot has no reference assets', async () => {
      mockGenerationFindUnique.mockResolvedValue({
        ...BASE_GENERATION,
        referenceImageUrl: 'https://example.com/single-ref.png',
        snapshot: null,
      })

      const result = await getGenerationById('gen-1')

      expect(result?.referenceImages).toEqual([
        {
          url: 'https://example.com/single-ref.png',
          role: 'identity',
        },
      ])
    })

    it('returns null when the generation does not exist', async () => {
      mockGenerationFindUnique.mockResolvedValue(null)

      await expect(getGenerationById('missing-gen')).resolves.toBeNull()
    })
  })

  describe('toggleGenerationVisibility', () => {
    it('returns null when the generation is not owned by the user', async () => {
      mockGenerationFindUnique.mockResolvedValue({
        id: 'gen-1',
        userId: 'other-user',
        isPublic: false,
        isPromptPublic: false,
        isFeatured: false,
      })

      await expect(
        toggleGenerationVisibility('gen-1', 'user-1', 'isPublic'),
      ).resolves.toBeNull()
      expect(mockGenerationUpdate).not.toHaveBeenCalled()
    })

    it('toggles the requested visibility field for the owner', async () => {
      mockGenerationFindUnique.mockResolvedValue({
        id: 'gen-1',
        userId: 'user-1',
        isPublic: false,
        isPromptPublic: false,
        isFeatured: false,
      })
      mockGenerationUpdate.mockResolvedValue({
        id: 'gen-1',
        isPublic: true,
        isPromptPublic: false,
        isFeatured: false,
      })

      const result = await toggleGenerationVisibility('gen-1', 'user-1')

      expect(result).toMatchObject({ id: 'gen-1', isPublic: true })
      expect(mockGenerationUpdate).toHaveBeenCalledWith({
        where: { id: 'gen-1' },
        data: { isPublic: true },
        select: {
          id: true,
          isPublic: true,
          isPromptPublic: true,
          isFeatured: true,
        },
      })
    })

    it('enforces the featured generation limit', async () => {
      mockGenerationFindUnique.mockResolvedValue({
        id: 'gen-1',
        userId: 'user-1',
        isPublic: true,
        isPromptPublic: true,
        isFeatured: false,
      })
      mockGenerationCount.mockResolvedValue(9)

      const result = await toggleGenerationVisibility(
        'gen-1',
        'user-1',
        'isFeatured',
      )

      expect(result).toEqual({ error: 'MAX_FEATURED_EXCEEDED' })
      expect(mockGenerationUpdate).not.toHaveBeenCalled()
    })
  })

  describe('count helpers', () => {
    it('counts public generations with filters', async () => {
      mockGenerationCount.mockResolvedValue(4)

      const result = await countPublicGenerations({
        model: 'sdxl',
        type: 'image',
        likedByUserId: 'viewer-1',
      })

      expect(result).toBe(4)
      expect(mockGenerationCount).toHaveBeenCalledWith({
        where: {
          isPublic: true,
          model: 'sdxl',
          outputType: 'IMAGE',
          likes: { some: { userId: 'viewer-1' } },
        },
      })
    })

    it('counts user image and video generations by output type', async () => {
      mockGenerationCount.mockResolvedValueOnce(5).mockResolvedValueOnce(3)

      await expect(countUserGenerationsByType('user-1')).resolves.toEqual({
        images: 5,
        videos: 3,
      })
    })
  })

  describe('getAssetSectionCounts', () => {
    it('aggregates type, project, and favorites counts in one round-trip', async () => {
      mockGenerationGroupBy
        .mockResolvedValueOnce([
          { outputType: 'IMAGE', _count: { _all: 7 } },
          { outputType: 'VIDEO', _count: { _all: 3 } },
          { outputType: 'AUDIO', _count: { _all: 2 } },
        ])
        .mockResolvedValueOnce([
          { projectId: null, _count: { _all: 4 } },
          { projectId: 'proj-a', _count: { _all: 5 } },
          { projectId: 'proj-b', _count: { _all: 3 } },
        ])
      mockGenerationCount.mockResolvedValueOnce(6)

      const counts = await getAssetSectionCounts('user-1')

      expect(counts).toEqual({
        all: 12,
        favorites: 6,
        image: 7,
        video: 3,
        audio: 2,
        model_3d: 0,
        unassigned: 4,
        byProject: {
          'proj-a': 5,
          'proj-b': 3,
        },
      })
      expect(mockGenerationGroupBy).toHaveBeenNthCalledWith(1, {
        by: ['outputType'],
        where: { userId: 'user-1' },
        _count: { _all: true },
      })
      expect(mockGenerationGroupBy).toHaveBeenNthCalledWith(2, {
        by: ['projectId'],
        where: { userId: 'user-1' },
        _count: { _all: true },
      })
      expect(mockGenerationCount).toHaveBeenCalledWith({
        where: { userId: 'user-1', likes: { some: { userId: 'user-1' } } },
      })
    })

    it('returns zeroed buckets when the user has no generations', async () => {
      mockGenerationGroupBy.mockResolvedValueOnce([]).mockResolvedValueOnce([])
      mockGenerationCount.mockResolvedValueOnce(0)

      await expect(getAssetSectionCounts('user-1')).resolves.toEqual({
        all: 0,
        favorites: 0,
        image: 0,
        video: 0,
        audio: 0,
        model_3d: 0,
        unassigned: 0,
        byProject: {},
      })
    })
  })

  describe('deleteGeneration', () => {
    it('returns null when the generation is not owned by the user', async () => {
      mockGenerationFindUnique.mockResolvedValue({
        id: 'gen-1',
        userId: 'other-user',
        storageKey: 'other.png',
      })

      await expect(deleteGeneration('gen-1', 'user-1')).resolves.toBeNull()
      expect(mockGenerationDelete).not.toHaveBeenCalled()
    })

    it('deletes an owned generation and returns its storage key', async () => {
      mockGenerationFindUnique.mockResolvedValue({
        id: 'gen-1',
        userId: 'user-1',
        storageKey: 'owned.png',
      })
      mockGenerationDelete.mockResolvedValue({ id: 'gen-1' })

      await expect(deleteGeneration('gen-1', 'user-1')).resolves.toEqual({
        storageKey: 'owned.png',
      })
      expect(mockUpdatePreferenceOnDeleted).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ id: 'gen-1' }),
      )
      expect(mockGenerationDelete).toHaveBeenCalledWith({
        where: { id: 'gen-1' },
      })
    })

    it('still deletes when preference update fails', async () => {
      mockGenerationFindUnique.mockResolvedValue({
        id: 'gen-1',
        userId: 'user-1',
        storageKey: 'owned.png',
      })
      mockUpdatePreferenceOnDeleted.mockRejectedValueOnce(
        new Error('preference unavailable'),
      )
      mockGenerationDelete.mockResolvedValue({ id: 'gen-1' })

      await expect(deleteGeneration('gen-1', 'user-1')).resolves.toEqual({
        storageKey: 'owned.png',
      })
      expect(mockGenerationDelete).toHaveBeenCalledWith({
        where: { id: 'gen-1' },
      })
    })
  })

  describe('batch operations', () => {
    it('batch deletes only owned generations and returns storage keys', async () => {
      mockGenerationFindMany.mockResolvedValue([
        { id: 'gen-1', storageKey: 'one.png' },
        { id: 'gen-2', storageKey: 'two.png' },
      ])
      mockGenerationDeleteMany.mockResolvedValue({ count: 2 })

      const result = await batchDeleteGenerations(
        ['gen-1', 'gen-2', 'gen-3'],
        'user-1',
      )

      expect(result).toEqual({
        deletedCount: 2,
        storageKeys: ['one.png', 'two.png'],
      })
      expect(mockGenerationDeleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['gen-1', 'gen-2'] } },
      })
    })

    it('batch updates visibility for owned generations only', async () => {
      mockGenerationUpdateMany.mockResolvedValue({ count: 2 })

      await expect(
        batchUpdateVisibility(['gen-1', 'gen-2'], 'user-1', 'isPublic', true),
      ).resolves.toBe(2)
      expect(mockGenerationUpdateMany).toHaveBeenCalledWith({
        where: { id: { in: ['gen-1', 'gen-2'] }, userId: 'user-1' },
        data: { isPublic: true },
      })
    })
  })

  describe('character card queries', () => {
    it('returns empty result for empty character combinations', async () => {
      await expect(
        getGenerationsByCharacterCombination([], 'user-1'),
      ).resolves.toEqual({
        generations: [],
        total: 0,
      })
      expect(mockGenerationFindMany).not.toHaveBeenCalled()
    })
  })

  describe('selectVariantWinner', () => {
    it('clears previous winners and marks the selected generation', async () => {
      mockGenerationFindFirst.mockResolvedValue({ id: 'gen-1' })
      mockGenerationUpdateMany.mockResolvedValue({ count: 3 })
      mockGenerationUpdate.mockResolvedValue({ id: 'gen-1', isWinner: true })

      await selectVariantWinner('user-1', 'run-1', 'gen-1')

      expect(mockDbTransaction).toHaveBeenCalledOnce()
      expect(mockGenerationFindFirst).toHaveBeenCalledWith({
        where: { id: 'gen-1', userId: 'user-1', runGroupId: 'run-1' },
        select: { id: true },
      })
      expect(mockGenerationUpdateMany).toHaveBeenCalledWith({
        where: { runGroupId: 'run-1', userId: 'user-1' },
        data: { isWinner: false },
      })
      expect(mockGenerationUpdate).toHaveBeenCalledWith({
        where: { id: 'gen-1' },
        data: { isWinner: true },
      })
    })

    it('throws when the selected generation is not in the run group', async () => {
      mockGenerationFindFirst.mockResolvedValue(null)

      await expect(
        selectVariantWinner('user-1', 'run-1', 'missing-gen'),
      ).rejects.toThrow('Generation not found or not part of this run group')
      expect(mockGenerationUpdateMany).not.toHaveBeenCalled()
    })
  })
})
