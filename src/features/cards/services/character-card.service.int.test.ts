/**
 * L2a 真库：角色卡的建 / 读 / 改 / 删，导入酒馆卡（附录J ⑥）。
 * 只假 R2（内存桶）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/services/storage/r2', async (importOriginal) =>
  (await import('@/test/fake-r2')).fakeR2Module(
    await importOriginal<typeof import('@/services/storage/r2')>(),
  ),
)

import { CHARACTER_CARD } from '@/constants/cards/character-card'
import {
  createCharacterCard,
  createImportedCharacterCard,
  deleteCharacterCard,
  getCharacterCard,
  listCharacterCards,
  updateCharacterCard,
} from '@/features/cards/services/character-card.service'
import { db } from '@/lib/db'
import { R2_PUBLIC_BASE, r2Bucket } from '@/test/fake-r2'
import { createTestCard } from '@/test/int/cards'
import { createTestUser, resetDatabase } from '@/test/int/db'

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  r2Bucket.clear()
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
})

const cardRow = (id: string) =>
  db.characterCard.findUniqueOrThrow({
    where: { id },
    include: { looks: true },
  })

describe('listCharacterCards', () => {
  it('只列自己没删的卡', async () => {
    await createTestCard(me.id, { name: 'Rei' })
    await createTestCard(me.id, { name: 'gone', isDeleted: true })
    await createTestCard(other.id, { name: 'theirs' })

    const result = await listCharacterCards(me.clerkId)

    expect(result.map((card) => card.name)).toEqual(['Rei'])
  })
})

describe('getCharacterCard', () => {
  it('别人的卡回 null', async () => {
    const theirs = await createTestCard(other.id, { name: 'Rei' })
    await expect(getCharacterCard(me.clerkId, theirs.id)).resolves.toBeNull()
  })
})

describe('deleteCharacterCard', () => {
  it('软删并回 true；找不到回 false', async () => {
    const card = await createTestCard(me.id)

    await expect(deleteCharacterCard(me.clerkId, card.id)).resolves.toBe(true)
    expect((await cardRow(card.id)).isDeleted).toBe(true)

    await expect(deleteCharacterCard(me.clerkId, 'missing')).resolves.toBe(
      false,
    )
  })
})

describe('updateCharacterCard', () => {
  it('改名只写名字；外观 / 图在造型上，⛔ 不碰', async () => {
    const card = await createTestCard(me.id, { name: 'Rei' })
    await db.characterLook.create({
      data: {
        characterCardId: card.id,
        isDefault: true,
        description: 'blue hair anime girl',
        referenceSlots: [
          {
            id: 'slot-1',
            role: 'identity',
            url: 'https://example.com/rei.png',
            isPrimary: true,
          },
        ],
      },
    })

    await updateCharacterCard(me.clerkId, card.id, { name: 'Rei 2' })

    const row = await cardRow(card.id)
    expect(row.name).toBe('Rei 2')
    expect(row.looks[0]).toMatchObject({
      description: 'blue hair anime girl',
      referenceSlots: [expect.objectContaining({ id: 'slot-1' })],
    })
  })

  it('扩展键按键合并：null 删键，⛔ 认不出的键原样保留；简介照写', async () => {
    const card = await createTestCard(me.id, {
      extensions: { 'acme.keep': 1, 'pv.variants': ['a'] },
    })

    await updateCharacterCard(me.clerkId, card.id, {
      summary: '雨夜里的侦探',
      extensions: { 'pv.variants': null, 'pv.note': 'x' },
    })

    const row = await cardRow(card.id)
    expect(row.extensions).toEqual({ 'acme.keep': 1, 'pv.note': 'x' })
    expect(row.summary).toBe('雨夜里的侦探')
  })
})

describe('createCharacterCard', () => {
  it('只建名字：⛔ 不上传；带一套没有图的默认造型；称呼取名字', async () => {
    const card = await createCharacterCard(me.clerkId, { name: '时夜' })

    expect(r2Bucket.size).toBe(0)
    const row = await cardRow(card.id)
    expect(row).toMatchObject({ name: '时夜', handle: '时夜', userId: me.id })
    expect(row.looks).toEqual([
      expect.objectContaining({ isDefault: true, referenceSlots: [] }),
    ])
    expect(card.looks).toHaveLength(1)
    expect(card.looks[0]!.referenceSlots).toEqual([])
  })
})

describe('createImportedCharacterCard（导入的酒馆卡，附录J ⑥）', () => {
  const imported = {
    name: '时夜',
    summary: '雨夜里的店主',
    tags: ['原创'],
    persona: {
      identity: '',
      behavior: '先替别人撑伞',
      speech: '',
      boundaries: '',
      catchphrases: [],
      learnedPhrases: [],
      relationship: '',
      interests: [],
      scenario: '雨夜的小店',
      opening: '欢迎光临。',
      examples: [{ user: '你好', reply: '嗯。' }],
      backstory: '{{char}} 开了一家店。',
    },
    extensions: { 'st.card': { spec: 'chara_card_v2' } },
  }

  it('有图：上 R2 当第一张参考图（主图）；设定、标签、扩展原样落库', async () => {
    const card = await createImportedCharacterCard(
      me.clerkId,
      imported,
      { data: Buffer.from([1, 2, 3]), mimeType: 'image/webp' },
      'zh',
    )

    const [[key, object]] = [...r2Bucket.entries()]
    expect(object).toMatchObject({ mimeType: 'image/webp' })
    const row = await cardRow(card.id)
    expect(row).toMatchObject({
      name: '时夜',
      summary: '雨夜里的店主',
      tags: ['原创'],
      persona: imported.persona,
      extensions: { 'st.card': { spec: 'chara_card_v2' } },
    })
    expect(row.looks).toEqual([
      expect.objectContaining({
        isDefault: true,
        referenceSlots: [
          expect.objectContaining({
            url: `${R2_PUBLIC_BASE}/${key}`,
            isPrimary: true,
          }),
        ],
      }),
    ])
    expect(card.looks[0]!.referenceSlots).toHaveLength(1)
  })

  it('JSON 卡没有图：不上传，建一张没有主图的角色', async () => {
    const card = await createImportedCharacterCard(
      me.clerkId,
      imported,
      null,
      'zh',
    )

    expect(r2Bucket.size).toBe(0)
    expect(card.looks[0]!.referenceSlots).toEqual([])
  })

  it('角色数到上限：带 i18nKey 的错，⛔ 不建卡', async () => {
    await db.characterCard.createMany({
      data: Array.from(
        { length: CHARACTER_CARD.MAX_CARDS_PER_USER },
        (_, i) => ({
          userId: me.id,
          name: `c${i}`,
        }),
      ),
    })

    await expect(
      createImportedCharacterCard(me.clerkId, imported, null, 'zh'),
    ).rejects.toMatchObject({ i18nKey: 'errors.tavernCard.limitReached' })
    expect(await db.characterCard.count()).toBe(
      CHARACTER_CARD.MAX_CARDS_PER_USER,
    )
  })
})
