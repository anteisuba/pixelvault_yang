import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mockEnsureUser = vi.hoisted(() => vi.fn())
const mockArenaMatchCreate = vi.hoisted(() => vi.fn())
const mockArenaMatchUpdate = vi.hoisted(() => vi.fn())
const mockArenaMatchFindUnique = vi.hoisted(() => vi.fn())
const mockArenaMatchFindMany = vi.hoisted(() => vi.fn())
const mockArenaMatchCount = vi.hoisted(() => vi.fn())
const mockArenaEntryCreate = vi.hoisted(() => vi.fn())
const mockArenaEntryUpdate = vi.hoisted(() => vi.fn())
const mockArenaEntryFindMany = vi.hoisted(() => vi.fn())
const mockModelEloUpsert = vi.hoisted(() => vi.fn())
const mockModelEloUpdateMany = vi.hoisted(() => vi.fn())
const mockModelEloFindMany = vi.hoisted(() => vi.fn())
const mockGenerateImageForUser = vi.hoisted(() => vi.fn())
const mockFetchAsBuffer = vi.hoisted(() => vi.fn())
const mockGenerateStorageKey = vi.hoisted(() => vi.fn())
const mockUploadToR2 = vi.hoisted(() => vi.fn())

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/services/user.service', () => ({
  ensureUser: (...args: unknown[]) => mockEnsureUser(...args),
}))

vi.mock('@/services/image/generate-image.service', () => ({
  generateImageForUser: (...args: unknown[]) =>
    mockGenerateImageForUser(...args),
}))

vi.mock('@/services/storage/r2', () => ({
  fetchAsBuffer: (...args: unknown[]) => mockFetchAsBuffer(...args),
  generateStorageKey: (...args: unknown[]) => mockGenerateStorageKey(...args),
  uploadToR2: (...args: unknown[]) => mockUploadToR2(...args),
}))

vi.mock('@/lib/db', () => ({
  db: {
    arenaMatch: {
      create: (...args: unknown[]) => mockArenaMatchCreate(...args),
      update: (...args: unknown[]) => mockArenaMatchUpdate(...args),
      findUnique: (...args: unknown[]) => mockArenaMatchFindUnique(...args),
      findMany: (...args: unknown[]) => mockArenaMatchFindMany(...args),
      count: (...args: unknown[]) => mockArenaMatchCount(...args),
    },
    arenaEntry: {
      create: (...args: unknown[]) => mockArenaEntryCreate(...args),
      update: (...args: unknown[]) => mockArenaEntryUpdate(...args),
      findMany: (...args: unknown[]) => mockArenaEntryFindMany(...args),
    },
    modelEloRating: {
      upsert: (...args: unknown[]) => mockModelEloUpsert(...args),
      updateMany: (...args: unknown[]) => mockModelEloUpdateMany(...args),
      findMany: (...args: unknown[]) => mockModelEloFindMany(...args),
    },
  },
}))

import {
  createArenaMatch,
  generateArenaEntry,
  getArenaHistory,
  getArenaLeaderboard,
  getModelWinRatesByTask,
  submitArenaVote,
} from './arena.service'

const DB_USER = { id: 'user-1' }

function makeVotedMatch(winnerEntryId = 'entry-a') {
  return {
    id: 'match-1',
    userId: 'user-1',
    votedAt: null,
    entries: [
      { id: 'entry-a', modelId: 'model-a', wasVoted: false },
      { id: 'entry-b', modelId: 'model-b', wasVoted: false },
    ],
    winnerId: winnerEntryId,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockEnsureUser.mockResolvedValue(DB_USER)
  mockArenaMatchUpdate.mockResolvedValue({})
  mockArenaEntryUpdate.mockResolvedValue({})
  mockModelEloUpdateMany.mockResolvedValue({ count: 1 })
  mockGenerateStorageKey.mockReturnValue('arena/user-1/ref.png')
  mockFetchAsBuffer.mockResolvedValue({
    buffer: Buffer.from('image'),
    mimeType: 'image/png',
  })
  mockUploadToR2.mockResolvedValue('https://r2.example.com/ref.png')
})

describe('createArenaMatch', () => {
  it('creates a match and stores uploaded data-url reference images in R2', async () => {
    mockArenaMatchCreate.mockResolvedValue({ id: 'match-1' })

    const result = await createArenaMatch('clerk-1', {
      prompt: 'a portrait with soft light',
      aspectRatio: '1:1',
      referenceImage: 'data:image/png;base64,aW1hZ2U=',
    })

    expect(result).toBe('match-1')
    expect(mockFetchAsBuffer).toHaveBeenCalledWith(
      'data:image/png;base64,aW1hZ2U=',
    )
    expect(mockArenaMatchCreate).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        prompt: 'a portrait with soft light',
        aspectRatio: '1:1',
        referenceImage: 'https://r2.example.com/ref.png',
      },
    })
  })

  it('propagates user lookup failures', async () => {
    mockEnsureUser.mockRejectedValue(new Error('auth failed'))

    await expect(
      createArenaMatch('clerk-1', {
        prompt: 'a portrait',
        aspectRatio: '1:1',
      }),
    ).rejects.toThrow('auth failed')
    expect(mockArenaMatchCreate).not.toHaveBeenCalled()
  })
})

describe('generateArenaEntry', () => {
  it('generates one entry for an owned unvoted match', async () => {
    mockArenaMatchFindUnique.mockResolvedValue({
      id: 'match-1',
      userId: 'user-1',
      prompt: 'a city at night',
      aspectRatio: '16:9',
      referenceImage: null,
      votedAt: null,
    })
    mockGenerateImageForUser.mockResolvedValue({
      id: 'gen-1',
      url: 'https://cdn.example.com/gen.png',
    })
    mockArenaEntryCreate.mockResolvedValue({
      id: 'entry-1',
      slotIndex: 0,
      modelId: 'model-a',
    })

    const result = await generateArenaEntry('match-1', 'clerk-1', {
      modelId: 'model-a',
      slotIndex: 0,
    })

    expect(result).toEqual({
      id: 'entry-1',
      slotIndex: 0,
      modelId: '',
      status: 'completed',
      imageUrl: 'https://cdn.example.com/gen.png',
      wasVoted: false,
    })
    expect(mockGenerateImageForUser).toHaveBeenCalledWith(
      'clerk-1',
      expect.objectContaining({
        prompt: 'a city at night',
        modelId: 'model-a',
        aspectRatio: '16:9',
      }),
    )
  })

  it('throws when the match is missing or owned by another user', async () => {
    mockArenaMatchFindUnique.mockResolvedValue({
      id: 'match-1',
      userId: 'other-user',
    })

    await expect(
      generateArenaEntry('match-1', 'clerk-1', {
        modelId: 'model-a',
        slotIndex: 0,
      }),
    ).rejects.toThrow('Match not found')
    expect(mockGenerateImageForUser).not.toHaveBeenCalled()
  })
})

describe('submitArenaVote', () => {
  it('marks the winner and applies smaller ELO changes when the favorite wins', async () => {
    mockArenaMatchFindUnique.mockResolvedValue(makeVotedMatch('entry-a'))
    mockModelEloUpsert.mockImplementation(
      ({ where }: { where: { modelId: string } }) =>
        Promise.resolve({
          modelId: where.modelId,
          rating: where.modelId === 'model-a' ? 1600 : 1400,
        }),
    )

    const result = await submitArenaVote('match-1', 'entry-a', 'clerk-1')

    const winner = result.eloUpdates.find((u) => u.modelId === 'model-a')
    const loser = result.eloUpdates.find((u) => u.modelId === 'model-b')
    expect(result.winnerId).toBe('entry-a')
    expect(winner?.oldRating).toBe(1600)
    expect(winner?.newRating).toBeCloseTo(1607.7, 1)
    expect(winner?.change).toBeLessThan(16)
    expect(loser?.newRating).toBeCloseTo(1392.3, 1)
    expect(loser?.change).toBeLessThan(0)
    expect(mockArenaMatchUpdate).toHaveBeenCalledWith({
      where: { id: 'match-1' },
      data: { winnerId: 'entry-a', votedAt: expect.any(Date) },
    })
    expect(mockArenaEntryUpdate).toHaveBeenCalledWith({
      where: { id: 'entry-a' },
      data: { wasVoted: true },
    })
  })

  it('gives an underdog winner more than the equal-rating baseline', async () => {
    mockArenaMatchFindUnique.mockResolvedValue(makeVotedMatch('entry-b'))
    mockModelEloUpsert.mockImplementation(
      ({ where }: { where: { modelId: string } }) =>
        Promise.resolve({
          modelId: where.modelId,
          rating: where.modelId === 'model-a' ? 1600 : 1400,
        }),
    )

    const result = await submitArenaVote('match-1', 'entry-b', 'clerk-1')

    const winner = result.eloUpdates.find((u) => u.modelId === 'model-b')
    const loser = result.eloUpdates.find((u) => u.modelId === 'model-a')
    expect(winner?.newRating).toBeCloseTo(1424.3, 1)
    expect(winner?.change).toBeGreaterThan(16)
    expect(loser?.newRating).toBeCloseTo(1575.7, 1)
    expect(loser?.change).toBeLessThan(0)
  })

  it('throws when voting on a match that has already been voted', async () => {
    mockArenaMatchFindUnique.mockResolvedValue({
      ...makeVotedMatch(),
      votedAt: new Date('2026-01-01T00:00:00.000Z'),
    })

    await expect(
      submitArenaVote('match-1', 'entry-a', 'clerk-1'),
    ).rejects.toThrow('Match already voted')
    expect(mockArenaEntryUpdate).not.toHaveBeenCalled()
  })
})

describe('getArenaLeaderboard', () => {
  it('sorts by stored rating and computes win rate', async () => {
    mockModelEloFindMany.mockResolvedValue([
      {
        modelId: 'model-a',
        modelFamily: 'Family A',
        rating: 1512.34,
        matchCount: 4,
        winCount: 3,
      },
      {
        modelId: 'model-b',
        modelFamily: null,
        rating: 1499.95,
        matchCount: 0,
        winCount: 0,
      },
    ])

    const result = await getArenaLeaderboard()

    expect(result).toEqual([
      {
        modelId: 'model-a',
        modelFamily: 'Family A',
        rating: 1512.3,
        matchCount: 4,
        winCount: 3,
        winRate: 75,
      },
      {
        modelId: 'model-b',
        modelFamily: null,
        rating: 1500,
        matchCount: 0,
        winCount: 0,
        winRate: 0,
      },
    ])
  })

  it('returns an empty leaderboard when no ratings exist', async () => {
    mockModelEloFindMany.mockResolvedValue([])

    await expect(getArenaLeaderboard()).resolves.toEqual([])
  })
})

describe('getArenaHistory', () => {
  it('returns voted matches for the current user with pagination metadata', async () => {
    mockArenaMatchFindMany.mockResolvedValue([
      {
        id: 'match-1',
        prompt: 'a city at night',
        aspectRatio: '16:9',
        winnerId: 'entry-a',
        votedAt: new Date('2026-01-02T00:00:00.000Z'),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        entries: [
          {
            id: 'entry-a',
            modelId: 'model-a',
            slotIndex: 0,
            wasVoted: true,
            generation: { url: 'https://cdn.example.com/a.png' },
          },
        ],
      },
    ])
    mockArenaMatchCount.mockResolvedValue(3)

    const result = await getArenaHistory('clerk-1', 1, 2)

    expect(result.total).toBe(3)
    expect(result.hasMore).toBe(true)
    expect(result.matches[0]?.entries[0]?.imageUrl).toBe(
      'https://cdn.example.com/a.png',
    )
    expect(mockArenaMatchFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', votedAt: { not: null } },
        skip: 0,
        take: 2,
      }),
    )
  })

  it('returns no matches and hasMore=false for an empty history page', async () => {
    mockArenaMatchFindMany.mockResolvedValue([])
    mockArenaMatchCount.mockResolvedValue(0)

    await expect(getArenaHistory('clerk-1', 1, 20)).resolves.toEqual({
      matches: [],
      total: 0,
      hasMore: false,
    })
  })
})

describe('getModelWinRatesByTask', () => {
  it('returns win rates only for models with at least three matches', async () => {
    mockArenaEntryFindMany.mockResolvedValue([
      { modelId: 'model-a', wasVoted: true },
      { modelId: 'model-a', wasVoted: false },
      { modelId: 'model-a', wasVoted: true },
      { modelId: 'model-b', wasVoted: true },
      { modelId: 'model-b', wasVoted: false },
    ])

    const result = await getModelWinRatesByTask('general')

    expect(result).toEqual({ 'model-a': 2 / 3 })
  })

  it('returns an empty object when no model reaches the sample threshold', async () => {
    mockArenaEntryFindMany.mockResolvedValue([
      { modelId: 'model-a', wasVoted: true },
      { modelId: 'model-a', wasVoted: false },
    ])

    await expect(getModelWinRatesByTask('general')).resolves.toEqual({})
  })
})
