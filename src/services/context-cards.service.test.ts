import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  CONTEXT_CARD_IMAGE_ROLE_IDS,
  CONTEXT_CARD_KIND_IDS,
  CONTEXT_CARD_LIMITS,
} from '@/constants/context-cards'

// ─── Mocks ──────────────────────────────────────────────────────

const mockFindMany = vi.fn()
const mockFindFirst = vi.fn()
const mockCount = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockDeleteMany = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    contextCard: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      count: (...args: unknown[]) => mockCount(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
  },
}))

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(async () => ({ id: 'db_user_1' })),
}))

import {
  ContextCardLimitError,
  createContextCard,
  deleteContextCard,
  listContextCards,
  parseContextCardImages,
  setContextCardPinned,
  updateContextCard,
} from '@/services/context-cards.service'

const SHEET = {
  url: 'https://cdn.example.com/context-cards/u1/sheet.png',
  role: CONTEXT_CARD_IMAGE_ROLE_IDS.sheet,
  sourceRef: 'official site',
}

const ROW = {
  id: 'card-1',
  kind: 'CHARACTER' as const,
  name: 'Sigrika',
  summary: 'Silver hair, gold eyes.',
  body: '## Appearance\nSilver hair.',
  images: [SHEET],
  negative: 'air ripples',
  pinnedScopes: ['video'],
  createdAt: new Date('2026-09-07T10:00:00.000Z'),
  updatedAt: new Date('2026-09-07T11:00:00.000Z'),
}

describe('context card service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('列表按 userId 收敛，最近改过的在前', async () => {
    mockFindMany.mockResolvedValue([ROW])

    const cards = await listContextCards('db_user_1')

    expect(cards).toEqual([
      {
        id: 'card-1',
        kind: CONTEXT_CARD_KIND_IDS.character,
        name: 'Sigrika',
        summary: ROW.summary,
        body: ROW.body,
        images: [SHEET],
        negative: 'air ripples',
        pinnedScopes: ['video'],
        createdAt: '2026-09-07T10:00:00.000Z',
        updatedAt: '2026-09-07T11:00:00.000Z',
      },
    ])
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'db_user_1' },
        orderBy: { updatedAt: 'desc' },
      }),
    )
  })

  it('按 kind 与常挂域过滤时把两个条件都下推到库', async () => {
    mockFindMany.mockResolvedValue([])

    await listContextCards('db_user_1', {
      kind: CONTEXT_CARD_KIND_IDS.style,
      pinnedScope: 'image',
    })

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'db_user_1',
          kind: 'STYLE',
          pinnedScopes: { has: 'image' },
        },
      }),
    )
  })

  /**
   * ⚠ 坏掉的**那一张图**被丢掉，⛔ 不连累整张卡读不出来 —— 用户该看到另外几张。
   */
  it('词表外的图 role 只丢那一张，卡照样读得出来', async () => {
    mockFindMany.mockResolvedValue([
      { ...ROW, images: [{ url: SHEET.url, role: 'mood-board' }, SHEET] },
    ])

    const [card] = await listContextCards('db_user_1')

    expect(card.images).toEqual([SHEET])
  })

  it('images 不是数组时读成空数组', () => {
    expect(parseContextCardImages(null)).toEqual([])
    expect(parseContextCardImages({ url: SHEET.url })).toEqual([])
  })

  /** 上限是一条真的会拒的闸 —— ⛔ 不静默挤掉最老的一张。 */
  it('撞上限时抛 ContextCardLimitError 且不写库', async () => {
    mockCount.mockResolvedValue(CONTEXT_CARD_LIMITS.maxPerUser)

    await expect(
      createContextCard('db_user_1', {
        kind: CONTEXT_CARD_KIND_IDS.character,
        name: 'One more',
        summary: '',
        body: '',
        pinnedScopes: [],
      }),
    ).rejects.toBeInstanceOf(ContextCardLimitError)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('新卡永远从零张参考图开始', async () => {
    mockCount.mockResolvedValue(0)
    mockCreate.mockResolvedValue({ ...ROW, images: [], pinnedScopes: [] })

    await createContextCard('db_user_1', {
      kind: CONTEXT_CARD_KIND_IDS.character,
      name: 'Sigrika',
      summary: 'Silver hair.',
      body: '',
      pinnedScopes: ['video', 'video'],
    })

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'db_user_1',
          kind: 'CHARACTER',
          images: [],
          // 同一个域挂两遍是个 no-op，⛔ 不在数组里堆两条。
          pinnedScopes: ['video'],
        }),
      }),
    )
  })

  it('改一张不属于自己的卡返回 null，且一个字都没写', async () => {
    mockFindFirst.mockResolvedValue(null)

    await expect(
      updateContextCard('db_user_1', 'card-x', { name: 'hijack' }),
    ).resolves.toBeNull()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  /**
   * ⭐ 常挂是**服务端读改写**：客户端整份覆盖会把另一个工作台刚挂上的那一格抹掉。
   */
  it('常挂在服务端读改写，保住别的域已有的那几格', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'card-1',
      pinnedScopes: ['image'],
    })
    mockUpdate.mockResolvedValue({ ...ROW, pinnedScopes: ['image', 'video'] })

    const card = await setContextCardPinned(
      'db_user_1',
      'card-1',
      'video',
      true,
    )

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'card-1' },
        data: expect.objectContaining({ pinnedScopes: ['image', 'video'] }),
      }),
    )
    expect(card?.pinnedScopes).toEqual(['image', 'video'])
  })

  it('取消常挂只摘那一格', async () => {
    mockFindFirst.mockResolvedValue({
      id: 'card-1',
      pinnedScopes: ['image', 'video'],
    })
    mockUpdate.mockResolvedValue({ ...ROW, pinnedScopes: ['image'] })

    await setContextCardPinned('db_user_1', 'card-1', 'video', false)

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ pinnedScopes: ['image'] }),
      }),
    )
  })

  it('没给的字段一个都不写进 update', async () => {
    mockFindFirst.mockResolvedValue({ id: 'card-1', pinnedScopes: [] })
    mockUpdate.mockResolvedValue(ROW)

    await updateContextCard('db_user_1', 'card-1', { name: 'Renamed' })

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: 'Renamed' } }),
    )
  })

  it('删除按 userId 收敛，删不到就是 false', async () => {
    mockDeleteMany.mockResolvedValue({ count: 0 })

    await expect(deleteContextCard('db_user_1', 'card-x')).resolves.toBe(false)
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { id: 'card-x', userId: 'db_user_1' },
    })
  })
})
