import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 新内核改库（第 4b 步）。形状照素材库四条那份：**做 → 撤 → 回到原状**，比的是整份状态。
 */

interface FakeLook {
  id: string
  characterCardId: string
  label: string | null
  isDefault: boolean
  description: string | null
  tags: string[]
  referenceSlots: unknown
  sortOrder: number
  createdAt: Date
}

interface FakeCard {
  id: string
  userId: string
  name: string
  handle: string | null
  tags: string[]
  persona: unknown
  isDeleted: boolean
  version: number
  updatedAt: Date
}

const store = {
  cards: [] as FakeCard[],
  looks: [] as FakeLook[],
  links: [] as {
    characterCardId: string
    loraAssetId: string
    lookId: string | null
  }[],
  loras: [] as {
    id: string
    userId: string
    name: string
    styleCode: string | null
    inLibrary: boolean
    coverImageUrl: string | null
    updatedAt: Date
  }[],
}

function initial() {
  const at = new Date('2026-10-01T00:00:00Z')
  store.cards = [
    {
      id: 'card-1',
      userId: 'user-1',
      name: '马尔福',
      handle: 'malfoy',
      tags: ['hp'],
      persona: { identity: 'student', speech: 'drawl' },
      isDeleted: false,
      version: 1,
      updatedAt: at,
    },
    {
      id: 'card-2',
      userId: 'user-2',
      name: 'Someone else',
      handle: null,
      tags: [],
      persona: null,
      isDeleted: false,
      version: 1,
      updatedAt: at,
    },
  ]
  store.looks = [
    {
      id: 'look-1',
      characterCardId: 'card-1',
      label: null,
      isDefault: true,
      description: 'platinum hair',
      tags: [],
      referenceSlots: [],
      sortOrder: 0,
      createdAt: at,
    },
    {
      id: 'look-2',
      characterCardId: 'card-1',
      label: '冬装',
      isDefault: false,
      description: 'scarf',
      tags: ['scarf'],
      referenceSlots: [],
      sortOrder: 1,
      createdAt: at,
    },
  ]
  store.links = []
  store.loras = [
    {
      id: 'lora-1',
      userId: 'user-1',
      name: 'Ink Lines',
      styleCode: null,
      inLibrary: true,
      coverImageUrl: null,
      updatedAt: at,
    },
  ]
}

function snapshot() {
  return JSON.parse(
    JSON.stringify({
      cards: store.cards.map(({ version: _version, ...card }) => card),
      looks: store.looks,
      links: store.links,
      loras: store.loras,
    }),
  ) as unknown
}

const linkKey = (where: {
  characterCardId_loraAssetId: { characterCardId: string; loraAssetId: string }
}) => where.characterCardId_loraAssetId

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  db: {
    characterCard: {
      findMany: vi.fn(async ({ where }: { where: { userId: string } }) =>
        store.cards
          .filter((card) => card.userId === where.userId && !card.isDeleted)
          .map((card) =>
            // 真库每次读出来都是新对象；这里照样拷一份，⛔ 不让写回去改到手里那份
            structuredClone({
              ...card,
              looks: store.looks.filter(
                (look) => look.characterCardId === card.id,
              ),
            }),
          ),
      ),
      findFirst: vi.fn(
        async ({ where }: { where: { id: string; userId: string } }) =>
          store.cards.find(
            (card) => card.id === where.id && card.userId === where.userId,
          ) ?? null,
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string }
          data: Partial<FakeCard>
        }) => {
          const card = store.cards.find((item) => item.id === where.id)!
          const { version: _version, ...rest } = data
          Object.assign(card, rest)
          return card
        },
      ),
    },
    characterLook: {
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string }
          data: Partial<FakeLook>
        }) => {
          const look = store.looks.find((item) => item.id === where.id)
          if (look) Object.assign(look, data)
          return { count: look ? 1 : 0 }
        },
      ),
    },
    characterCardLora: {
      findUnique: vi.fn(
        async ({ where }: { where: Parameters<typeof linkKey>[0] }) => {
          const key = linkKey(where)
          return (
            store.links.find(
              (link) =>
                link.characterCardId === key.characterCardId &&
                link.loraAssetId === key.loraAssetId,
            ) ?? null
          )
        },
      ),
      upsert: vi.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: Parameters<typeof linkKey>[0]
          create: (typeof store.links)[number]
          update: { lookId: string | null }
        }) => {
          const key = linkKey(where)
          const found = store.links.find(
            (link) =>
              link.characterCardId === key.characterCardId &&
              link.loraAssetId === key.loraAssetId,
          )
          if (found) Object.assign(found, update)
          else store.links.push({ ...create })
        },
      ),
      delete: vi.fn(
        async ({ where }: { where: Parameters<typeof linkKey>[0] }) => {
          const key = linkKey(where)
          store.links = store.links.filter(
            (link) =>
              link.characterCardId !== key.characterCardId ||
              link.loraAssetId !== key.loraAssetId,
          )
        },
      ),
    },
    loraAsset: {
      findMany: vi.fn(async ({ where }: { where: { userId: string } }) =>
        structuredClone(
          store.loras.filter((lora) => lora.userId === where.userId),
        ),
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string }
          data: Record<string, unknown>
        }) => {
          Object.assign(store.loras.find((lora) => lora.id === where.id)!, data)
        },
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; userId: string }
          data: Record<string, unknown>
        }) => {
          const lora = store.loras.find(
            (item) => item.id === where.id && item.userId === where.userId,
          )
          if (lora) Object.assign(lora, data)
          return { count: lora ? 1 : 0 }
        },
      ),
    },
  },
}))
vi.mock('@/services/cards/character-card.service', () => ({
  createCharacterCard: vi.fn(),
  updateCharacterCard: vi.fn(
    async (
      _clerkId: string,
      cardId: string,
      data: Partial<Pick<FakeCard, 'name' | 'tags' | 'persona'>>,
    ) => {
      const card = store.cards.find((item) => item.id === cardId)
      if (!card) return null
      Object.assign(card, data)
      return card
    },
  ),
}))
vi.mock('@/services/cards/character-look.service', () => ({
  createCharacterLook: vi.fn(),
  updateCharacterLook: vi.fn(
    async (_clerkId: string, lookId: string, data: Partial<FakeLook>) => {
      Object.assign(store.looks.find((look) => look.id === lookId)!, data)
    },
  ),
}))
vi.mock('@/services/prompts/recipe.service', () => ({
  createRecipe: vi.fn(),
  updateRecipe: vi.fn(),
}))
vi.mock('@/services/storage/r2', () => ({ isOwnedStorageUrl: () => true }))
const revisions = vi.hoisted(() => ({
  record: vi.fn(async () => 'rev-1'),
  markReverted: vi.fn(async () => undefined),
}))
vi.mock('@/services/cards/character-revision.service', () => ({
  recordCharacterRevision: revisions.record,
  markCharacterRevisionReverted: revisions.markReverted,
}))

import {
  favoriteLora,
  linkLoraToCharacter,
  revertLibraryWrite,
  writeCharacterProfile,
} from './assistant-library-write.service'

const owner = { userId: 'user-1', clerkId: 'clerk-1' }

beforeEach(() => initial())

describe('新内核改库：做 → 撤 → 回到原状', () => {
  it('改设定（含「一句外观」落在默认造型上），撤销原样写回', async () => {
    const before = snapshot()
    const outcome = await writeCharacterProfile(owner, {
      character: '马尔福',
      fields: [
        { field: 'speech', text: 'sneers a lot' },
        { field: 'look', text: 'slicked-back hair' },
      ],
    })
    expect(outcome.ok).toBe(true)
    expect(store.cards[0]!.persona).toMatchObject({
      identity: 'student',
      speech: 'sneers a lot',
    })
    expect(store.looks[0]!.description).toBe('slicked-back hair')
    if (!outcome.ok) return
    expect(outcome.payload.summary).toContain('角色·马尔福')
    await revertLibraryWrite(owner.userId, outcome.inverse)
    expect(snapshot()).toEqual(before)
  })

  it('改设定记进「她改了什么」，对话里撤销时那一行一起标成撤回过（C）', async () => {
    const outcome = await writeCharacterProfile(owner, {
      character: '马尔福',
      fields: [{ field: 'speech', text: 'sneers a lot' }],
    })
    expect(revisions.record).toHaveBeenLastCalledWith(
      expect.objectContaining({
        userId: owner.userId,
        source: 'CHAT',
        before: expect.objectContaining({
          persona: expect.objectContaining({ speech: 'drawl' }),
        }),
        after: expect.objectContaining({
          persona: expect.objectContaining({ speech: 'sneers a lot' }),
        }),
      }),
    )
    if (!outcome.ok) throw new Error('write failed')
    await revertLibraryWrite(owner.userId, outcome.inverse)
    expect(revisions.markReverted).toHaveBeenLastCalledWith(
      owner.userId,
      'rev-1',
    )
  })

  it('开场白、对话示例、口头禅、不会做的事也能直接写（10-26），撤销写回', async () => {
    const before = snapshot()
    const outcome = await writeCharacterProfile(owner, {
      character: '马尔福',
      fields: [
        { field: 'opening', text: '哼，又是你。' },
        {
          field: 'examples',
          text: '<START>\n{{user}}: 谢谢你\n{{char}}: 别以为我会说不客气。\n<START>\n{{char}}: 走开。',
        },
        { field: 'catchphrases', text: '「哼」\n我父亲会听说这件事的' },
        { field: 'moods', text: '嘴硬：先否认再软下来\n\n得意：拖长音' },
        { field: 'boundaries', text: '不当着别人面道谢' },
      ],
    })
    expect(outcome.ok).toBe(true)
    expect(store.cards[0]!.persona).toMatchObject({
      identity: 'student',
      opening: '哼，又是你。',
      examples: [
        { user: '谢谢你', reply: '别以为我会说不客气。' },
        { user: '', reply: '走开。' },
      ],
      catchphrases: ['哼', '我父亲会听说这件事的'],
      moods: ['嘴硬：先否认再软下来', '得意：拖长音'],
      boundaries: '不当着别人面道谢',
    })
    if (!outcome.ok) return
    await revertLibraryWrite(owner.userId, outcome.inverse)
    expect(snapshot()).toEqual(before)
  })

  it('LoRA 加到角色的某套造型，撤销把这一条拿掉', async () => {
    const before = snapshot()
    const outcome = await linkLoraToCharacter(owner, {
      lora: 'ink lines',
      character: '马尔福',
      look: '冬装',
    })
    expect(outcome.ok).toBe(true)
    expect(store.links).toEqual([
      { characterCardId: 'card-1', loraAssetId: 'lora-1', lookId: 'look-2' },
    ])
    if (!outcome.ok) return
    expect(await revertLibraryWrite(owner.userId, outcome.inverse)).toEqual({
      revertedCount: 1,
      skipped: 0,
    })
    expect(snapshot()).toEqual(before)
  })

  it('取消收藏 LoRA 只移出收藏（不删行），撤销收回来', async () => {
    const before = snapshot()
    const outcome = await favoriteLora(owner, { lora: 'Ink', value: false })
    expect(outcome.ok && store.loras[0]!.inLibrary).toBe(false)
    if (!outcome.ok) return
    await revertLibraryWrite(owner.userId, outcome.inverse)
    expect(snapshot()).toEqual(before)
  })

  it('⛔ 别人的角色认不出、改不了', async () => {
    const outcome = await writeCharacterProfile(owner, {
      character: 'Someone else',
      fields: [{ field: 'speech', text: 'x' }],
    })
    expect(outcome.ok).toBe(false)
    expect(store.cards[1]!.persona).toBeNull()
    expect(
      await revertLibraryWrite(owner.userId, {
        kind: 'favorite_lora',
        loraAssetId: 'lora-of-someone-else',
        inLibrary: true,
      }),
    ).toEqual({ revertedCount: 0, skipped: 1 })
  })
})
