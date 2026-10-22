import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockEnsureUser = vi.fn()
vi.mock('@/services/user.service', () => ({
  ensureUser: (...a: unknown[]) => mockEnsureUser(...a),
}))

const mockCardFindMany = vi.fn()
const mockAssetFindFirst = vi.fn()
const mockAssetDelete = vi.fn()
const mockUpsertImportedLora = vi.fn()
const mockLinkDeleteMany = vi.fn()
const mockLinkUpsert = vi.fn()
const mockTransaction = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    characterCard: {
      findMany: (...a: unknown[]) => mockCardFindMany(...a),
    },
    loraAsset: {
      findFirst: (...a: unknown[]) => mockAssetFindFirst(...a),
      delete: (...a: unknown[]) => mockAssetDelete(...a),
    },
    characterCardLora: {
      deleteMany: (...a: unknown[]) => mockLinkDeleteMany(...a),
      upsert: (...a: unknown[]) => mockLinkUpsert(...a),
    },
    $transaction: (...a: unknown[]) => mockTransaction(...a),
  },
}))

vi.mock('@/services/lora-asset.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/lora-asset.service')>()),
  upsertImportedLora: (...a: unknown[]) => mockUpsertImportedLora(...a),
}))

import {
  listCharacterLoraGroups,
  setLoraCharacters,
} from '@/services/cards/character-lora.service'

const USER = { id: 'user_1' }

function assetRow(id: string) {
  return {
    id,
    userId: USER.id,
    styleCode: `pv-${id}`,
    name: `LoRA ${id}`,
    source: 'imported',
    type: 'subject',
    baseModelFamily: 'illustrious',
    provider: 'runner',
    triggerWord: 'trig',
    loraUrl: `https://cdn.test/${id}.safetensors`,
    coverImageUrl: null,
    previewImageUrls: [],
    defaultScale: 0.8,
    isPublic: false,
    createdAt: new Date('2026-10-22T00:00:00Z'),
    civitaiModelId: null,
    civitaiModelVersionId: null,
    civitaiFileHashAutoV3: null,
    recommendedPrompt: null,
    sourceSnapshot: null,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockEnsureUser.mockResolvedValue(USER)
  mockTransaction.mockResolvedValue([])
})

describe('listCharacterLoraGroups', () => {
  it('每个角色一组：封面取默认造型的主图、带上造型、LoRA 按收进来的顺序', async () => {
    mockCardFindMany.mockResolvedValue([
      {
        id: 'denia',
        name: 'Denia',
        looks: [
          {
            id: 'denia-main',
            label: null,
            isDefault: true,
            tags: ['pink_hair'],
            referenceSlots: [
              {
                id: 's1',
                url: 'https://cdn.test/side.png',
                isPrimary: false,
                role: 'identity',
              },
              {
                id: 's2',
                url: 'https://cdn.test/main.png',
                isPrimary: true,
                role: 'identity',
              },
            ],
          },
          {
            id: 'denia-q',
            label: 'Q版',
            isDefault: false,
            tags: ['chibi'],
            referenceSlots: [],
          },
        ],
        loraLinks: [
          { loraAsset: assetRow('a'), lookId: null },
          { loraAsset: assetRow('b'), lookId: 'denia-q' },
        ],
      },
      { id: 'ron', name: 'Ron', looks: [], loraLinks: [] },
    ])

    const groups = await listCharacterLoraGroups('clerk_1')

    expect(groups).toHaveLength(2)
    expect(groups[0]).toMatchObject({
      characterCardId: 'denia',
      coverUrl: 'https://cdn.test/main.png',
      looks: [
        { id: 'denia-main', label: null, isDefault: true, tags: ['pink_hair'] },
        { id: 'denia-q', label: 'Q版', isDefault: false, tags: ['chibi'] },
      ],
    })
    expect(groups[0]!.loras.map((lora) => [lora.id, lora.lookId])).toEqual([
      ['a', null],
      ['b', 'denia-q'],
    ])
    expect(groups[0]!.loras[0]!.isOwn).toBe(true)
    expect(groups[1]).toMatchObject({
      characterCardId: 'ron',
      coverUrl: null,
      looks: [],
      loras: [],
    })
    const where = mockCardFindMany.mock.calls[0]![0].where
    expect(where).toEqual({ userId: USER.id, isDeleted: false })
  })

  it('给了角色只取那一位', async () => {
    mockCardFindMany.mockResolvedValue([])
    await listCharacterLoraGroups('clerk_1', 'denia')
    expect(mockCardFindMany.mock.calls[0]![0].where).toEqual({
      userId: USER.id,
      isDeleted: false,
      id: 'denia',
    })
  })
})

describe('setLoraCharacters', () => {
  const LORA = {
    name: 'Denia',
    triggerWord: 'denia',
    loraUrl: 'https://cdn.test/a.safetensors',
    type: 'subject' as const,
    baseModelFamily: 'sdxl' as const,
    provider: 'runner',
  }
  const pick = (characterCardId: string, lookId: string | null = null) => ({
    characterCardId,
    lookId,
  })
  /** 第一次 findMany = 校验角色归属；之后 = 返回分组。 */
  const ownCards = (...cards: { id: string; looks?: string[] }[]) =>
    mockCardFindMany
      .mockResolvedValueOnce(
        cards.map((card) => ({
          id: card.id,
          looks: (card.looks ?? []).map((id) => ({ id })),
        })),
      )
      .mockResolvedValue([])

  it('整组替换：勾掉的删、新勾的按角色写一行（同一位勾两次只算一次）', async () => {
    mockAssetFindFirst.mockResolvedValue({
      id: 'a',
      source: 'imported',
      inLibrary: true,
    })
    ownCards({ id: 'denia', looks: ['denia-q'] }, { id: 'ron' })

    const result = await setLoraCharacters('clerk_1', LORA, [
      pick('denia'),
      pick('ron'),
      pick('denia', 'denia-q'),
    ])

    expect(result).toEqual([])
    expect(mockAssetFindFirst.mock.calls[0]![0].where).toEqual({
      userId: USER.id,
      loraUrl: LORA.loraUrl,
    })
    expect(mockUpsertImportedLora).not.toHaveBeenCalled()
    expect(mockLinkDeleteMany).toHaveBeenCalledWith({
      where: { loraAssetId: 'a', characterCardId: { notIn: ['denia', 'ron'] } },
    })
    expect(mockLinkUpsert).toHaveBeenCalledTimes(2)
    expect(mockLinkUpsert.mock.calls[0]![0]).toMatchObject({
      create: { characterCardId: 'denia', loraAssetId: 'a', lookId: 'denia-q' },
      update: { lookId: 'denia-q' },
    })
    expect(mockLinkUpsert.mock.calls[1]![0]).toMatchObject({
      create: { characterCardId: 'ron', loraAssetId: 'a', lookId: null },
    })
    expect(mockTransaction).toHaveBeenCalledTimes(1)
    expect(mockAssetDelete).not.toHaveBeenCalled()
  })

  it('没收藏的 LoRA：在你名下记一行但不进库，再收进角色', async () => {
    mockAssetFindFirst.mockResolvedValue(null)
    mockUpsertImportedLora.mockResolvedValue({
      id: 'new',
      source: 'imported',
      inLibrary: false,
    })
    ownCards({ id: 'denia' })

    await setLoraCharacters('clerk_1', LORA, [pick('denia')])

    expect(mockUpsertImportedLora).toHaveBeenCalledWith(USER.id, LORA, {
      inLibrary: false,
    })
    expect(mockLinkUpsert.mock.calls[0]![0]).toMatchObject({
      create: { characterCardId: 'denia', loraAssetId: 'new', lookId: null },
    })
  })

  it('全部勾掉：收藏的只拿掉关联，行留着', async () => {
    mockAssetFindFirst.mockResolvedValue({
      id: 'a',
      source: 'imported',
      inLibrary: true,
    })
    mockCardFindMany.mockResolvedValue([])

    await setLoraCharacters('clerk_1', LORA, [])

    expect(mockLinkDeleteMany).toHaveBeenCalledWith({
      where: { loraAssetId: 'a', characterCardId: { notIn: [] } },
    })
    expect(mockLinkUpsert).not.toHaveBeenCalled()
    expect(mockAssetDelete).not.toHaveBeenCalled()
  })

  it('全部勾掉：只被角色收着、没收藏的那一行随之删掉', async () => {
    mockAssetFindFirst.mockResolvedValue({
      id: 'a',
      source: 'imported',
      inLibrary: false,
    })
    mockCardFindMany.mockResolvedValue([])

    await setLoraCharacters('clerk_1', LORA, [])

    expect(mockAssetDelete).toHaveBeenCalledWith({ where: { id: 'a' } })
  })

  it('没收藏、也一个角色都没勾：什么都不写', async () => {
    mockAssetFindFirst.mockResolvedValue(null)
    mockCardFindMany.mockResolvedValue([])

    await setLoraCharacters('clerk_1', LORA, [])

    expect(mockUpsertImportedLora).not.toHaveBeenCalled()
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('有角色不是你的（或已删）→ 404，什么都不写', async () => {
    ownCards({ id: 'denia' })

    await expect(
      setLoraCharacters('clerk_1', LORA, [pick('denia'), pick('someone_else')]),
    ).rejects.toMatchObject({ httpStatus: 404 })
    expect(mockAssetFindFirst).not.toHaveBeenCalled()
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('造型不是她的 → 404，什么都不写', async () => {
    ownCards({ id: 'denia', looks: ['denia-q'] })

    await expect(
      setLoraCharacters('clerk_1', LORA, [pick('denia', 'ron-look')]),
    ).rejects.toMatchObject({ httpStatus: 404 })
    expect(mockTransaction).not.toHaveBeenCalled()
  })
})
