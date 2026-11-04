/**
 * L2a 真库：工作台把角色卡送去出图时带哪几张图、哪套造型（`loadCardBusCharacters`）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { db } from '@/lib/db'
import { createTestCard, createTestGeneration } from '@/test/int/cards'
import { createTestUser, resetDatabase } from '@/test/int/db'

import { loadCardBusCharacters } from './card-bus.service'

const SLOTS = [
  {
    id: 'slot-1',
    role: 'identity',
    url: 'https://cdn.test/1.png',
    isPrimary: true,
  },
  {
    id: 'slot-2',
    role: 'identity',
    url: 'https://cdn.test/2.png',
    isPrimary: false,
  },
  {
    id: 'slot-3',
    role: 'costume',
    url: 'https://cdn.test/3.png',
    isPrimary: false,
  },
]

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>
let cardId: string
let chibiLookId: string
let defaultLookId: string

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
  const card = await createTestCard(me.id, {
    name: 'Denia',
    handle: 'Denia',
    version: 2,
  })
  cardId = card.id
  chibiLookId = (
    await db.characterLook.create({
      data: {
        characterCardId: card.id,
        description: 'chibi',
        tags: ['chibi'],
        referenceSlots: [
          {
            id: 'slot-1',
            role: 'identity',
            url: 'https://cdn.test/chibi.png',
            isPrimary: true,
          },
        ],
      },
    })
  ).id
  defaultLookId = (
    await db.characterLook.create({
      data: {
        characterCardId: card.id,
        isDefault: true,
        description: 'pink hair',
        tags: ['denia_(wuthering_waves)'],
        referenceSlots: SLOTS,
      },
    })
  ).id
})

describe('loadCardBusCharacters · 工作台挑的图（owner 09-27）', () => {
  it('没挑就按主图 → 身份 → 其余自动排', async () => {
    const [character] = await loadCardBusCharacters(me.id, [cardId])
    expect(character?.slots.map((slot) => slot.id)).toEqual([
      'slot-1',
      'slot-2',
      'slot-3',
    ])
  })

  it('挑了就只送挑的那几张、按挑的顺序；「用她出的」只认本人的图片生成', async () => {
    const made = await createTestGeneration(me.id, {
      url: 'https://cdn.test/made.png',
    })
    const video = await createTestGeneration(me.id, {
      outputType: 'VIDEO',
      url: 'https://cdn.test/clip.mp4',
    })
    const theirs = await createTestGeneration(other.id, {
      url: 'https://cdn.test/theirs.png',
    })

    const [character] = await loadCardBusCharacters(me.id, [cardId], {
      [cardId]: [
        { slotId: 'slot-3' },
        { generationId: made.id },
        { generationId: video.id },
        { generationId: theirs.id },
      ],
    })
    expect(character?.slots.map((slot) => slot.url)).toEqual([
      'https://cdn.test/3.png',
      'https://cdn.test/made.png',
    ])
  })

  it('挑的全都认不出（别人的图 / 已删的槽）就退回自动排，不让她一张图都不带', async () => {
    const theirs = await createTestGeneration(other.id)
    const [character] = await loadCardBusCharacters(me.id, [cardId], {
      [cardId]: [{ slotId: 'gone' }, { generationId: theirs.id }],
    })
    expect(character?.slots[0]?.id).toBe('slot-1')
  })

  it('别人的卡 / 已删的卡不送', async () => {
    const theirs = await createTestCard(other.id)
    const deleted = await createTestCard(me.id, { isDeleted: true })
    expect(await loadCardBusCharacters(me.id, [theirs.id, deleted.id])).toEqual(
      [],
    )
  })
})

describe('loadCardBusCharacters · 造型（角色④）', () => {
  it('没给造型用默认造型：外观文字、标签、图都取默认那套', async () => {
    const [character] = await loadCardBusCharacters(me.id, [cardId])
    expect(character).toMatchObject({
      lookId: defaultLookId,
      visual: 'pink hair',
      tags: ['denia_(wuthering_waves)'],
    })
  })

  it('给了造型就用那套；挑的图在那套的参考槽里认', async () => {
    const [character] = await loadCardBusCharacters(
      me.id,
      [cardId],
      { [cardId]: [{ slotId: 'slot-1' }] },
      { [cardId]: chibiLookId },
    )
    expect(character).toMatchObject({ lookId: chibiLookId, visual: 'chibi' })
    expect(character?.slots.map((slot) => slot.url)).toEqual([
      'https://cdn.test/chibi.png',
    ])
  })

  it('认不出的造型 id（别的卡的造型）回到默认造型', async () => {
    const otherCard = await createTestCard(me.id, { name: '别的' })
    const foreignLook = await db.characterLook.create({
      data: {
        characterCardId: otherCard.id,
        isDefault: true,
        description: 'x',
      },
    })
    const [character] = await loadCardBusCharacters(
      me.id,
      [cardId],
      undefined,
      {
        [cardId]: foreignLook.id,
      },
    )
    expect(character?.lookId).toBe(defaultLookId)
  })
})
