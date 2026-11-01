import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  memories: vi.fn(),
  findingFirst: vi.fn(),
  findingDelete: vi.fn(),
  revert: vi.fn(),
  forget: vi.fn(),
  outingState: vi.fn(),
  journals: vi.fn(),
  revisions: vi.fn(),
  findings: vi.fn(),
  journalFirst: vi.fn(),
  journalUpdate: vi.fn(),
  journalDeleteMany: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    characterCard: { findFirst: mocks.findFirst, update: mocks.update },
    assistantMemory: { findMany: mocks.memories },
    characterFinding: {
      findFirst: mocks.findingFirst,
      delete: mocks.findingDelete,
      findMany: mocks.findings,
    },
    characterJournal: {
      findMany: mocks.journals,
      findFirst: mocks.journalFirst,
      update: mocks.journalUpdate,
      deleteMany: mocks.journalDeleteMany,
    },
    characterCardRevision: { findMany: mocks.revisions },
  },
}))
vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(async () => ({ id: 'user-1' })),
}))
vi.mock('./character-revision.service', () => ({
  revertCharacterRevision: mocks.revert,
}))
vi.mock('./character-findings.service', () => ({
  forgetFindings: mocks.forget,
}))
vi.mock('./character-outing.service', () => ({
  getCharacterOutingState: mocks.outingState,
}))

import {
  deleteCharacterFindingForClerkId,
  deleteCharacterJournalForClerkId,
  getCharacterGrowthForClerkId,
  listCharacterRecentActivityForClerkId,
  revertCharacterRevisionForClerkId,
  updateCharacterJournalForClerkId,
} from './character-growth.service'

describe('日记能改能删（第 ③ 步）', () => {
  it('只改自己的；别人的回 null', async () => {
    mocks.journalFirst.mockResolvedValueOnce({ id: 'j1' })
    mocks.journalUpdate.mockResolvedValueOnce({
      id: 'j1',
      text: '新的',
      createdAt: new Date('2026-10-30T00:00:00Z'),
    })
    await expect(
      updateCharacterJournalForClerkId('clerk', 'j1', { text: '新的' }),
    ).resolves.toEqual({
      id: 'j1',
      text: '新的',
      createdAt: '2026-10-30T00:00:00.000Z',
    })
    expect(mocks.journalFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'j1', userId: 'user-1' } }),
    )
    mocks.journalFirst.mockResolvedValueOnce(null)
    await expect(
      updateCharacterJournalForClerkId('clerk', 'j9', { text: 'x' }),
    ).resolves.toBeNull()
  })

  it('删只删自己的那篇', async () => {
    mocks.journalDeleteMany.mockResolvedValueOnce({ count: 1 })
    await expect(deleteCharacterJournalForClerkId('clerk', 'j1')).resolves.toBe(
      true,
    )
    expect(mocks.journalDeleteMany).toHaveBeenCalledWith({
      where: { id: 'j1', userId: 'user-1' },
    })
    mocks.journalDeleteMany.mockResolvedValueOnce({ count: 0 })
    await expect(deleteCharacterJournalForClerkId('clerk', 'j9')).resolves.toBe(
      false,
    )
  })
})

const AT = new Date('2026-10-26T10:00:00Z')
const OUTING = { running: null, recent: [], frequentSites: ['pixiv.net'] }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.memories.mockResolvedValue([])
  mocks.outingState.mockResolvedValue(OUTING)
})

describe('getCharacterGrowthForClerkId', () => {
  it('只读自己的卡，日期转成字符串；见闻、观点（去掉前缀）、出门状态一起回', async () => {
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
      findings: [
        {
          id: 'f1',
          source: 'bilibili',
          url: 'https://www.bilibili.com/video/BV1',
          title: '水彩叠色',
          note: '先铺冷色再压暖色',
          seenAt: AT,
        },
        {
          id: 'f2',
          source: 'myspace',
          url: 'https://example.com',
          title: 'x',
          note: 'x',
          seenAt: AT,
        },
      ],
    })
    mocks.memories.mockResolvedValue([
      { id: 'm1', text: '观点：厚涂更适合画雨天。', createdAt: AT },
    ])
    const growth = await getCharacterGrowthForClerkId('clerk', 'card-1')
    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'card-1', userId: 'user-1', isDeleted: false },
      }),
    )
    expect(mocks.memories).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-1',
          characterCardId: 'card-1',
          text: { startsWith: '观点：' },
        },
      }),
    )
    expect(growth?.journals[0]?.createdAt).toBe(AT.toISOString())
    expect(growth?.revisions[0]).toMatchObject({
      before: { speech: '慢吞吞' },
      revertedAt: null,
      createdAt: AT.toISOString(),
    })
    // 认不出的来源不往页面上送。
    expect(growth?.findings.map((row) => row.id)).toEqual(['f1'])
    expect(growth?.findings[0]?.seenAt).toBe(AT.toISOString())
    expect(growth?.opinions).toEqual([
      { id: 'm1', text: '厚涂更适合画雨天。', createdAt: AT.toISOString() },
    ])
    expect(growth?.outing).toEqual(OUTING)
    expect(mocks.outingState).toHaveBeenCalledWith('user-1', 'card-1')
  })

  it('不是你的卡回 null', async () => {
    mocks.findFirst.mockResolvedValue(null)
    await expect(
      getCharacterGrowthForClerkId('clerk', 'card-x'),
    ).resolves.toBeNull()
  })
})

describe('deleteCharacterFindingForClerkId', () => {
  it('只删自己的，连同想起用的索引；别人的回 false', async () => {
    mocks.findingFirst.mockResolvedValueOnce({
      id: 'f1',
      characterCardId: 'card-1',
    })
    await expect(deleteCharacterFindingForClerkId('clerk', 'f1')).resolves.toBe(
      true,
    )
    expect(mocks.findingFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'f1', userId: 'user-1' } }),
    )
    expect(mocks.findingDelete).toHaveBeenCalledWith({ where: { id: 'f1' } })
    expect(mocks.forget).toHaveBeenCalledWith('card-1', ['f1'])

    mocks.findingFirst.mockResolvedValueOnce(null)
    await expect(deleteCharacterFindingForClerkId('clerk', 'f9')).resolves.toBe(
      false,
    )
    expect(mocks.findingDelete).toHaveBeenCalledTimes(1)
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

describe('listCharacterRecentActivityForClerkId', () => {
  it('每位只留最近一件事，按时间排，最多三位；只看没删的卡、没撤回的改动', async () => {
    const at = (h: number) =>
      new Date(`2026-10-29T${String(h).padStart(2, '0')}:00:00Z`)
    mocks.journals.mockResolvedValue([
      { characterCardId: 'a', text: '下雨天', createdAt: at(9) },
      { characterCardId: 'b', text: '学了新歌', createdAt: at(5) },
    ])
    mocks.revisions.mockResolvedValue([
      { characterCardId: 'a', fields: ['speech'], createdAt: at(10) },
      { characterCardId: 'c', fields: ['behavior'], createdAt: at(7) },
    ])
    mocks.findings.mockResolvedValue([
      { characterCardId: 'd', title: '新版本 PV', seenAt: at(3) },
    ])

    const rows = await listCharacterRecentActivityForClerkId('clerk-1')

    expect(rows).toEqual([
      {
        cardId: 'a',
        kind: 'revision',
        text: '',
        fields: ['speech'],
        at: at(10).toISOString(),
      },
      {
        cardId: 'c',
        kind: 'revision',
        text: '',
        fields: ['behavior'],
        at: at(7).toISOString(),
      },
      {
        cardId: 'b',
        kind: 'journal',
        text: '学了新歌',
        fields: [],
        at: at(5).toISOString(),
      },
    ])
    expect(mocks.journals).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', characterCard: { isDeleted: false } },
      }),
    )
    expect(mocks.revisions).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'user-1',
          characterCard: { isDeleted: false },
          revertedAt: null,
        },
      }),
    )
  })
})
