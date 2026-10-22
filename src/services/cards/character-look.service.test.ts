import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mockEnsureUser = vi.fn()
vi.mock('@/services/user.service', () => ({
  ensureUser: (...a: unknown[]) => mockEnsureUser(...a),
}))

const mockCardFindUnique = vi.fn()
const mockCardFindUniqueOrThrow = vi.fn()
const mockCardUpdate = vi.fn()
const mockLookFindUnique = vi.fn()
const mockLookFindFirst = vi.fn()
const mockLookFindMany = vi.fn()
const mockLookCreate = vi.fn()
const mockLookUpdate = vi.fn()
const mockLookUpdateMany = vi.fn()
const mockLookDelete = vi.fn()

vi.mock('@/lib/db', () => {
  const client = {
    characterCard: {
      findUnique: (...a: unknown[]) => mockCardFindUnique(...a),
      findUniqueOrThrow: (...a: unknown[]) => mockCardFindUniqueOrThrow(...a),
      update: (...a: unknown[]) => mockCardUpdate(...a),
    },
    characterLook: {
      findUnique: (...a: unknown[]) => mockLookFindUnique(...a),
      findFirst: (...a: unknown[]) => mockLookFindFirst(...a),
      findMany: (...a: unknown[]) => mockLookFindMany(...a),
      create: (...a: unknown[]) => mockLookCreate(...a),
      update: (...a: unknown[]) => mockLookUpdate(...a),
      updateMany: (...a: unknown[]) => mockLookUpdateMany(...a),
      delete: (...a: unknown[]) => mockLookDelete(...a),
    },
  }
  return {
    db: {
      ...client,
      $transaction: (fn: (tx: typeof client) => unknown) => fn(client),
    },
  }
})

import {
  createCharacterLook,
  deleteCharacterLook,
  updateCharacterLook,
} from '@/services/cards/character-look.service'

const USER = { id: 'user_1' }
const SLOT = {
  id: 's1',
  role: 'identity',
  url: 'https://cdn.test/denia.png',
  isPrimary: true,
}

function lookRow(id: string, isDefault: boolean, ownerId = USER.id) {
  return {
    id,
    characterCardId: 'denia',
    label: isDefault ? null : 'Q版',
    isDefault,
    description: '粉发',
    tags: ['pink_hair'],
    referenceSlots: [SLOT],
    sortOrder: isDefault ? 0 : 1,
    characterCard: { userId: ownerId, isDeleted: false },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockEnsureUser.mockResolvedValue(USER)
  mockCardFindUnique.mockResolvedValue({
    id: 'denia',
    userId: USER.id,
    isDeleted: false,
  })
  mockCardFindUniqueOrThrow.mockResolvedValue({
    id: 'denia',
    name: 'Denia',
    tags: [],
    createdAt: new Date(0),
    updatedAt: new Date(0),
    looks: [lookRow('main', true)],
  })
})

describe('createCharacterLook', () => {
  it('排在最后；勾了复制就带上那套的外观、标签和图', async () => {
    mockLookFindMany.mockResolvedValue([
      { id: 'main', sortOrder: 0 },
      { id: 'q', sortOrder: 3 },
    ])
    mockLookFindFirst.mockResolvedValue(lookRow('main', true))

    const card = await createCharacterLook('clerk_1', 'denia', {
      label: '冬装',
      copyFromLookId: 'main',
    })

    expect(mockLookFindFirst.mock.calls[0]![0].where).toEqual({
      id: 'main',
      characterCardId: 'denia',
    })
    expect(mockLookCreate.mock.calls[0]![0].data).toEqual({
      characterCardId: 'denia',
      label: '冬装',
      isDefault: false,
      description: '粉发',
      tags: ['pink_hair'],
      referenceSlots: [SLOT],
      sortOrder: 4,
    })
    expect(card.looks).toHaveLength(1)
  })

  it('不复制：一套空造型', async () => {
    mockLookFindMany.mockResolvedValue([{ id: 'main', sortOrder: 0 }])

    await createCharacterLook('clerk_1', 'denia', { label: '冬装' })

    expect(mockLookFindFirst).not.toHaveBeenCalled()
    expect(mockLookCreate.mock.calls[0]![0].data).toMatchObject({
      description: null,
      tags: [],
      referenceSlots: [],
      sortOrder: 1,
    })
  })

  it('到上限 → 400，不建', async () => {
    mockLookFindMany.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({ id: `l${i}`, sortOrder: i })),
    )

    await expect(
      createCharacterLook('clerk_1', 'denia', { label: 'x' }),
    ).rejects.toMatchObject({ i18nKey: 'errors.characterLook.limit' })
    expect(mockLookCreate).not.toHaveBeenCalled()
  })

  it('别人的角色 → 404', async () => {
    mockCardFindUnique.mockResolvedValue({
      id: 'denia',
      userId: 'other',
      isDeleted: false,
    })

    await expect(
      createCharacterLook('clerk_1', 'denia', { label: 'x' }),
    ).rejects.toMatchObject({ httpStatus: 404 })
    expect(mockLookCreate).not.toHaveBeenCalled()
  })
})

describe('updateCharacterLook', () => {
  it('设为默认：原默认让位，恰有一套默认；角色版本 +1', async () => {
    mockLookFindUnique.mockResolvedValue(lookRow('q', false))

    await updateCharacterLook('clerk_1', 'q', { isDefault: true })

    expect(mockLookUpdateMany).toHaveBeenCalledWith({
      where: { characterCardId: 'denia', isDefault: true },
      data: { isDefault: false },
    })
    expect(mockLookUpdate).toHaveBeenCalledWith({
      where: { id: 'q' },
      data: { isDefault: true },
    })
    expect(mockCardUpdate).toHaveBeenCalledWith({
      where: { id: 'denia' },
      data: { version: { increment: 1 } },
    })
  })

  it('空名字 / 空外观写 null；只写改了的格', async () => {
    mockLookFindUnique.mockResolvedValue(lookRow('q', false))

    await updateCharacterLook('clerk_1', 'q', { label: '', description: '' })

    expect(mockLookUpdateMany).not.toHaveBeenCalled()
    expect(mockLookUpdate.mock.calls[0]![0].data).toEqual({
      label: null,
      description: null,
    })
  })

  it('别人的造型 → 404，什么都不写', async () => {
    mockLookFindUnique.mockResolvedValue(lookRow('q', false, 'other'))

    await expect(
      updateCharacterLook('clerk_1', 'q', { label: 'x' }),
    ).rejects.toMatchObject({ httpStatus: 404 })
    expect(mockLookUpdate).not.toHaveBeenCalled()
  })
})

describe('deleteCharacterLook', () => {
  it('删默认造型：排最前的那套接任默认', async () => {
    mockLookFindUnique.mockResolvedValue(lookRow('main', true))
    mockLookFindMany.mockResolvedValue([
      { id: 'q', label: 'Q版' },
      { id: 'w', label: '冬装' },
    ])

    await deleteCharacterLook('clerk_1', 'main')

    expect(mockLookDelete).toHaveBeenCalledWith({ where: { id: 'main' } })
    expect(mockLookUpdate).toHaveBeenCalledWith({
      where: { id: 'q' },
      data: { isDefault: true },
    })
  })

  it('删非默认：不动默认', async () => {
    mockLookFindUnique.mockResolvedValue(lookRow('q', false))
    mockLookFindMany.mockResolvedValue([{ id: 'main', label: null }])

    await deleteCharacterLook('clerk_1', 'q')

    expect(mockLookDelete).toHaveBeenCalledWith({ where: { id: 'q' } })
    expect(mockLookUpdate).not.toHaveBeenCalled()
  })

  it('最后一套不能删', async () => {
    mockLookFindUnique.mockResolvedValue(lookRow('main', true))
    mockLookFindMany.mockResolvedValue([])

    await expect(deleteCharacterLook('clerk_1', 'main')).rejects.toMatchObject({
      i18nKey: 'errors.characterLook.lastLook',
    })
    expect(mockLookDelete).not.toHaveBeenCalled()
  })
})
