import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockArenaMatchFindMany = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    arenaMatch: {
      findMany: (...args: unknown[]) => mockArenaMatchFindMany(...args),
    },
  },
}))

import { getModelWinRatesByTask } from '@/services/arena-winrate.service'

describe('getModelWinRatesByTask', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('computes per-task win rates for participating models', async () => {
    mockArenaMatchFindMany.mockResolvedValue([
      {
        winnerId: 'entry-a-1',
        entries: [
          { id: 'entry-a-1', modelId: 'model-a' },
          { id: 'entry-b-1', modelId: 'model-b' },
        ],
      },
      {
        winnerId: 'entry-b-2',
        entries: [
          { id: 'entry-a-2', modelId: 'model-a' },
          { id: 'entry-b-2', modelId: 'model-b' },
        ],
      },
    ])

    const result = await getModelWinRatesByTask('portrait', 2)

    expect(result.get('model-a')).toBe(0.5)
    expect(result.get('model-b')).toBe(0.5)
    expect(mockArenaMatchFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          taskType: 'portrait',
          winnerId: { not: null },
        },
      }),
    )
  })

  it('filters models below the minMatches threshold', async () => {
    mockArenaMatchFindMany.mockResolvedValue([
      {
        winnerId: 'entry-a-1',
        entries: [
          { id: 'entry-a-1', modelId: 'model-a' },
          { id: 'entry-b-1', modelId: 'model-b' },
        ],
      },
      {
        winnerId: 'entry-b-2',
        entries: [
          { id: 'entry-a-2', modelId: 'model-a' },
          { id: 'entry-b-2', modelId: 'model-b' },
        ],
      },
    ])

    const result = await getModelWinRatesByTask('portrait', 3)

    expect(result.size).toBe(0)
  })

  it('returns an empty map when no matches exist for a task', async () => {
    mockArenaMatchFindMany.mockResolvedValue([])

    const result = await getModelWinRatesByTask('architecture')

    expect(result.size).toBe(0)
  })
})
