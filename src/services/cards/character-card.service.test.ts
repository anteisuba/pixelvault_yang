import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockEnsureUser = vi.fn()
vi.mock('@/services/user.service', () => ({
  ensureUser: (...a: unknown[]) => mockEnsureUser(...a),
}))

vi.mock('@/services/storage/r2', () => ({
  generateStorageKey: vi.fn().mockReturnValue('key/abc'),
  uploadToR2: vi.fn().mockResolvedValue('https://r2.example.com/abc.jpg'),
}))

const mockFindMany = vi.fn()
const mockFindUnique = vi.fn()
const mockUpdate = vi.fn()
const mockCount = vi.fn()
const mockCardCreate = vi.fn()

vi.mock('@/services/cards/card-handle.service', () => ({
  allocateHandleForNewCard: vi.fn().mockResolvedValue('时夜'),
}))

vi.mock('@/lib/db', () => ({
  db: {
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({
        characterCard: { create: (...a: unknown[]) => mockCardCreate(...a) },
      }),
    characterCard: {
      findMany: (...a: unknown[]) => mockFindMany(...a),
      findUnique: (...a: unknown[]) => mockFindUnique(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
      count: (...a: unknown[]) => mockCount(...a),
      create: (...a: unknown[]) => mockCardCreate(...a),
    },
  },
}))

import { uploadToR2 } from '@/services/storage/r2'
import {
  createCharacterCard,
  createImportedCharacterCard,
  listCharacterCards,
  getCharacterCard,
  deleteCharacterCard,
  updateCharacterCard,
} from '@/services/cards/character-card.service'

const FAKE_USER = { id: 'db_user_1', clerkId: 'clerk_1' }
const FAKE_LOOK = {
  id: 'look_1',
  label: null,
  isDefault: true,
  description: 'blue hair anime girl',
  tags: [],
  referenceSlots: [
    {
      id: 'slot-1',
      role: 'identity',
      url: 'https://example.com/rei.png',
      isPrimary: true,
    },
  ],
}
const FAKE_CARD = {
  id: 'card_1',
  userId: 'db_user_1',
  name: 'Rei',
  tags: [],
  isDeleted: false,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  looks: [FAKE_LOOK],
}

/** `create` 的嵌套默认造型 → 读出来的那一行。 */
function createdRow({ data }: { data: Record<string, unknown> }) {
  const nested = (data.looks as { create: Record<string, unknown> }).create
  return Promise.resolve({
    ...FAKE_CARD,
    ...data,
    id: 'card_new',
    looks: [
      {
        id: 'look_new',
        label: null,
        tags: [],
        description: null,
        ...nested,
      },
    ],
  })
}

describe('listCharacterCards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
  })

  it('returns a list of cards for the user', async () => {
    mockFindMany.mockResolvedValue([FAKE_CARD])

    const result = await listCharacterCards('clerk_1')

    expect(result).toHaveLength(1)
    expect(result[0]?.name).toBe('Rei')
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'db_user_1', isDeleted: false },
      }),
    )
  })
})

describe('getCharacterCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
  })

  it('returns null when card belongs to another user', async () => {
    mockFindUnique.mockResolvedValue({ ...FAKE_CARD, userId: 'other' })

    const result = await getCharacterCard('clerk_1', 'card_1')

    expect(result).toBeNull()
  })
})

describe('deleteCharacterCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
  })

  it('soft-deletes and returns true', async () => {
    mockFindUnique.mockResolvedValue(FAKE_CARD)
    mockUpdate.mockResolvedValue({})

    const result = await deleteCharacterCard('clerk_1', 'card_1')

    expect(result).toBe(true)
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'card_1' },
      data: { isDeleted: true },
    })
  })

  it('returns false when not found', async () => {
    mockFindUnique.mockResolvedValue(null)

    const result = await deleteCharacterCard('clerk_1', 'missing')

    expect(result).toBe(false)
  })
})

describe('updateCharacterCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockUpdate.mockImplementation(async ({ data }) => ({
      ...FAKE_CARD,
      ...data,
    }))
  })

  it('改名只写名字；外观 / 图在造型上，⛔ 不碰', async () => {
    mockFindUnique.mockResolvedValue(FAKE_CARD)
    await updateCharacterCard('clerk_1', 'card_1', { name: 'Rei 2' })
    const { data } = mockUpdate.mock.calls[0]![0]
    expect(data.name).toBe('Rei 2')
    expect(data).not.toHaveProperty('referenceSlots')
    expect(data).not.toHaveProperty('description')
  })

  it('扩展键按键合并：null 删键，⛔ 认不出的键原样保留；简介照写', async () => {
    mockFindUnique.mockResolvedValue({
      ...FAKE_CARD,
      extensions: { 'acme.keep': 1, 'pv.variants': ['a'] },
    })
    await updateCharacterCard('clerk_1', 'card_1', {
      summary: '雨夜里的侦探',
      extensions: { 'pv.variants': null, 'pv.note': 'x' },
    })
    const { data } = mockUpdate.mock.calls[0]![0]
    expect(data.extensions).toEqual({ 'acme.keep': 1, 'pv.note': 'x' })
    expect(data.summary).toBe('雨夜里的侦探')
  })
})

describe('createCharacterCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockCount.mockResolvedValue(0)
    mockCardCreate.mockImplementation(createdRow)
  })

  it('只建名字：⛔ 不上传；读出来没有图', async () => {
    const card = await createCharacterCard('clerk_1', { name: '时夜' })

    expect(uploadToR2).not.toHaveBeenCalled()
    expect(mockCardCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: '时夜',
          handle: '时夜',
          looks: {
            create: expect.objectContaining({
              isDefault: true,
              referenceSlots: [],
            }),
          },
        }),
      }),
    )
    expect(card.looks).toHaveLength(1)
    expect(card.looks[0]!.referenceSlots).toEqual([])
  })
})

describe('createImportedCharacterCard（导入的酒馆卡，附录J ⑥）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockCount.mockResolvedValue(0)
    mockCardCreate.mockImplementation(createdRow)
  })

  const imported = {
    name: '时夜',
    summary: '雨夜里的店主',
    tags: ['原创'],
    persona: {
      identity: '',
      behavior: '先替别人撑伞',
      speech: '',
      catchphrases: [],
      scenario: '雨夜的小店',
      opening: '欢迎光临。',
      examples: [{ user: '你好', reply: '嗯。' }],
      backstory: '{{char}} 开了一家店。',
    },
    extensions: { 'st.card': { spec: 'chara_card_v2' } },
  }

  it('有图：上 R2 当第一张参考图（主图）；设定、标签、扩展原样落库', async () => {
    const card = await createImportedCharacterCard('clerk_1', imported, {
      data: Buffer.from([1, 2, 3]),
      mimeType: 'image/webp',
    })

    expect(uploadToR2).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: 'image/webp' }),
    )
    expect(mockCardCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: '时夜',
          summary: '雨夜里的店主',
          tags: ['原创'],
          looks: {
            create: expect.objectContaining({
              isDefault: true,
              referenceSlots: [
                expect.objectContaining({
                  url: 'https://r2.example.com/abc.jpg',
                  isPrimary: true,
                }),
              ],
            }),
          },
          persona: imported.persona,
          extensions: { 'st.card': { spec: 'chara_card_v2' } },
        }),
      }),
    )
    expect(card.looks[0]!.referenceSlots).toHaveLength(1)
  })

  it('JSON 卡没有图：不上传，建一张没有主图的角色', async () => {
    const card = await createImportedCharacterCard('clerk_1', imported, null)

    expect(uploadToR2).not.toHaveBeenCalled()
    expect(card.looks[0]!.referenceSlots).toEqual([])
  })

  it('角色数到上限：带 i18nKey 的错，⛔ 不建卡', async () => {
    mockCount.mockResolvedValue(10_000)

    await expect(
      createImportedCharacterCard('clerk_1', imported, null),
    ).rejects.toMatchObject({ i18nKey: 'errors.tavernCard.limitReached' })
    expect(mockCardCreate).not.toHaveBeenCalled()
  })
})
