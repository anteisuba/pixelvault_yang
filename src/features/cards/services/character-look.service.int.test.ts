/**
 * L2a 真库：角色的造型（建 / 改 / 删；恰有一套默认；别人的碰不到）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { CHARACTER_CARD } from '@/constants/cards/character-card'
import {
  createCharacterLook,
  deleteCharacterLook,
  updateCharacterLook,
} from '@/features/cards/services/character-look.service'
import { db } from '@/lib/db'
import { createTestCard } from '@/test/int/cards'
import { createTestUser, resetDatabase } from '@/test/int/db'

const SLOT = {
  id: 's1',
  role: 'identity',
  url: 'https://cdn.test/denia.png',
  isPrimary: true,
}

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>
let cardId: string
let mainId: string

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
  cardId = (await createTestCard(me.id, { name: 'Denia' })).id
  mainId = (
    await db.characterLook.create({
      data: {
        characterCardId: cardId,
        isDefault: true,
        description: '粉发',
        tags: ['pink_hair'],
        referenceSlots: [SLOT],
        sortOrder: 0,
      },
    })
  ).id
})

const looks = () =>
  db.characterLook.findMany({
    where: { characterCardId: cardId },
    orderBy: { sortOrder: 'asc' },
  })

async function addLook(label: string, sortOrder: number) {
  return (
    await db.characterLook.create({
      data: { characterCardId: cardId, label, sortOrder },
    })
  ).id
}

describe('createCharacterLook', () => {
  it('排在最后；勾了复制就带上那套的外观、标签和图', async () => {
    await addLook('Q版', 3)

    const card = await createCharacterLook(me.clerkId, cardId, {
      label: '冬装',
      copyFromLookId: mainId,
    })

    const rows = await looks()
    expect(rows.at(-1)).toMatchObject({
      label: '冬装',
      isDefault: false,
      description: '粉发',
      tags: ['pink_hair'],
      referenceSlots: [SLOT],
      sortOrder: 4,
    })
    expect(card.looks.map((look) => look.label)).toContain('冬装')
  })

  it('不复制：一套空造型；拿别的卡的造型来复制 → 找不到，不建', async () => {
    const foreignCard = await createTestCard(other.id)
    const foreign = await db.characterLook.create({
      data: { characterCardId: foreignCard.id, description: '别人的' },
    })

    await createCharacterLook(me.clerkId, cardId, { label: '冬装' })
    await expect(
      createCharacterLook(me.clerkId, cardId, {
        label: '偷',
        copyFromLookId: foreign.id,
      }),
    ).rejects.toMatchObject({ httpStatus: 404 })

    const rows = await looks()
    expect(rows).toHaveLength(2)
    const winter = rows[1]
    expect(winter).toMatchObject({
      label: '冬装',
      description: null,
      tags: [],
      referenceSlots: [],
      sortOrder: 1,
    })
  })

  it('到上限 → 400，不建', async () => {
    for (let i = 1; i < CHARACTER_CARD.MAX_LOOKS_PER_CARD; i += 1)
      await addLook(`l${i}`, i)

    await expect(
      createCharacterLook(me.clerkId, cardId, { label: 'x' }),
    ).rejects.toMatchObject({ i18nKey: 'errors.characterLook.limit' })
    expect(await db.characterLook.count()).toBe(
      CHARACTER_CARD.MAX_LOOKS_PER_CARD,
    )
  })

  it('别人的角色 → 404', async () => {
    await expect(
      createCharacterLook(other.clerkId, cardId, { label: 'x' }),
    ).rejects.toMatchObject({ httpStatus: 404 })
    expect(await db.characterLook.count()).toBe(1)
  })
})

describe('updateCharacterLook', () => {
  it('设为默认：原默认让位，恰有一套默认；角色版本 +1', async () => {
    const q = await addLook('Q版', 1)

    await updateCharacterLook(me.clerkId, q, { isDefault: true })

    const rows = await looks()
    expect(
      rows.filter((look) => look.isDefault).map((look) => look.id),
    ).toEqual([q])
    const card = await db.characterCard.findUniqueOrThrow({
      where: { id: cardId },
    })
    expect(card.version).toBe(2)
  })

  it('空名字 / 空外观写 null；只写改了的格', async () => {
    const q = await db.characterLook.create({
      data: {
        characterCardId: cardId,
        label: 'Q版',
        description: '小小的',
        tags: ['chibi'],
        sortOrder: 1,
      },
    })

    await updateCharacterLook(me.clerkId, q.id, { label: '', description: '' })

    const row = await db.characterLook.findUniqueOrThrow({
      where: { id: q.id },
    })
    expect(row).toMatchObject({
      label: null,
      description: null,
      tags: ['chibi'],
      isDefault: false,
    })
    expect(
      (await db.characterLook.findUniqueOrThrow({ where: { id: mainId } }))
        .isDefault,
    ).toBe(true)
  })

  it('别人的造型 → 404，什么都不写', async () => {
    await expect(
      updateCharacterLook(other.clerkId, mainId, { label: 'x' }),
    ).rejects.toMatchObject({ httpStatus: 404 })
    expect(
      (await db.characterLook.findUniqueOrThrow({ where: { id: mainId } }))
        .label,
    ).toBeNull()
  })
})

describe('deleteCharacterLook', () => {
  it('删默认造型：排最前的那套接任默认', async () => {
    const q = await addLook('Q版', 1)
    await addLook('冬装', 2)

    await deleteCharacterLook(me.clerkId, mainId)

    const rows = await looks()
    expect(rows.map((look) => look.label)).toEqual(['Q版', '冬装'])
    expect(rows.find((look) => look.isDefault)?.id).toBe(q)
  })

  it('删非默认：不动默认', async () => {
    const q = await addLook('Q版', 1)

    await deleteCharacterLook(me.clerkId, q)

    const rows = await looks()
    expect(rows.map((look) => look.id)).toEqual([mainId])
    expect(rows[0]?.isDefault).toBe(true)
  })

  it('最后一套不能删；别人的删不掉', async () => {
    await expect(deleteCharacterLook(me.clerkId, mainId)).rejects.toMatchObject(
      {
        i18nKey: 'errors.characterLook.lastLook',
      },
    )
    await addLook('Q版', 1)
    await expect(
      deleteCharacterLook(other.clerkId, mainId),
    ).rejects.toMatchObject({ httpStatus: 404 })
    expect(await db.characterLook.count()).toBe(2)
  })
})
