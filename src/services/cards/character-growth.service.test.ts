import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  revert: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: { characterCard: { findFirst: mocks.findFirst } },
}))
vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(async () => ({ id: 'user-1' })),
}))
vi.mock('./character-revision.service', () => ({
  revertCharacterRevision: mocks.revert,
}))

import {
  getCharacterGrowthForClerkId,
  revertCharacterRevisionForClerkId,
} from './character-growth.service'

const AT = new Date('2026-10-26T10:00:00Z')

beforeEach(() => vi.clearAllMocks())

describe('getCharacterGrowthForClerkId', () => {
  it('只读自己的卡，日期转成字符串', async () => {
    mocks.findFirst.mockResolvedValue({
      journals: [{ id: 'j1', text: '今天他画崩了', createdAt: AT }],
      revisions: [
        {
          id: 'r1',
          source: 'REFLECTION',
          fields: ['speech'],
          before: { speech: '慢吞吞' },
          after: { speech: '慢吞吞，熟了拖长音' },
          reason: '跟他熟了',
          revertedAt: null,
          createdAt: AT,
        },
      ],
    })
    const growth = await getCharacterGrowthForClerkId('clerk', 'card-1')
    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'card-1', userId: 'user-1', isDeleted: false },
      }),
    )
    expect(growth?.journals[0]?.createdAt).toBe(AT.toISOString())
    expect(growth?.revisions[0]).toMatchObject({
      before: { speech: '慢吞吞' },
      revertedAt: null,
      createdAt: AT.toISOString(),
    })
  })

  it('不是你的卡回 null', async () => {
    mocks.findFirst.mockResolvedValue(null)
    await expect(
      getCharacterGrowthForClerkId('clerk', 'card-x'),
    ).resolves.toBeNull()
  })
})

describe('revertCharacterRevisionForClerkId', () => {
  it('撤成了回 reverted，撤不了回 null', async () => {
    mocks.revert.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    await expect(
      revertCharacterRevisionForClerkId('clerk', 'r1'),
    ).resolves.toEqual({ reverted: true })
    expect(mocks.revert).toHaveBeenCalledWith('user-1', 'r1')
    await expect(
      revertCharacterRevisionForClerkId('clerk', 'r1'),
    ).resolves.toBeNull()
  })
})
