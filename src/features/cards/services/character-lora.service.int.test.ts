/**
 * L2a 真库：角色收的 LoRA（分组列表、整组替换、没收藏的记一行不进库、孤行随之删）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  listCharacterLoraGroups,
  setLoraCharacters,
} from '@/features/cards/services/character-lora.service'
import { db } from '@/lib/db'
import { createTestCard } from '@/test/int/cards'
import { createTestUser, resetDatabase } from '@/test/int/db'

const LORA = {
  name: 'Denia',
  triggerWord: 'denia',
  loraUrl: 'https://cdn.test/a.safetensors',
  type: 'subject' as const,
  baseModelFamily: 'sdxl' as const,
  provider: 'runner',
}

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
})

function asset(
  code: string,
  extra: { inLibrary?: boolean; loraUrl?: string } = {},
) {
  return db.loraAsset.create({
    data: {
      userId: me.id,
      name: `LoRA ${code}`,
      styleCode: `pv-${code}`,
      source: 'imported',
      triggerWord: 'trig',
      loraUrl: extra.loraUrl ?? `https://cdn.test/${code}.safetensors`,
      ...(extra.inLibrary === undefined ? {} : { inLibrary: extra.inLibrary }),
    },
  })
}

function look(cardId: string, data: Record<string, unknown> = {}) {
  return db.characterLook.create({ data: { characterCardId: cardId, ...data } })
}

const pick = (characterCardId: string, lookId: string | null = null) => ({
  characterCardId,
  lookId,
})

const links = async () =>
  (
    await db.characterCardLora.findMany({
      select: { characterCardId: true, loraAssetId: true, lookId: true },
    })
  ).sort((x, y) => x.characterCardId.localeCompare(y.characterCardId))

const sorted = <T extends { characterCardId: string }>(rows: T[]) =>
  [...rows].sort((x, y) => x.characterCardId.localeCompare(y.characterCardId))

describe('listCharacterLoraGroups', () => {
  it('每个角色一组：封面取默认造型的主图、带上造型、LoRA 按收进来的顺序；只看自己没删的', async () => {
    const denia = await createTestCard(me.id, { name: 'Denia' })
    await createTestCard(me.id, { name: 'gone', isDeleted: true })
    await createTestCard(other.id, { name: 'theirs' })
    const main = await look(denia.id, {
      isDefault: true,
      tags: ['pink_hair'],
      sortOrder: 0,
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
    })
    const q = await look(denia.id, {
      label: 'Q版',
      tags: ['chibi'],
      sortOrder: 1,
    })
    const a = await asset('a')
    const b = await asset('b')
    await db.characterCardLora.create({
      data: {
        characterCardId: denia.id,
        loraAssetId: b.id,
        lookId: q.id,
        createdAt: new Date('2026-10-23T00:00:00Z'),
      },
    })
    await db.characterCardLora.create({
      data: {
        characterCardId: denia.id,
        loraAssetId: a.id,
        createdAt: new Date('2026-10-22T00:00:00Z'),
      },
    })
    const ron = await createTestCard(me.id, { name: 'Ron' })

    const groups = await listCharacterLoraGroups(me.clerkId)

    expect(groups.map((group) => group.name).sort()).toEqual(['Denia', 'Ron'])
    const deniaGroup = groups.find(
      (group) => group.characterCardId === denia.id,
    )!
    expect(deniaGroup).toMatchObject({
      coverUrl: 'https://cdn.test/main.png',
      looks: [
        { id: main.id, label: null, isDefault: true, tags: ['pink_hair'] },
        { id: q.id, label: 'Q版', isDefault: false, tags: ['chibi'] },
      ],
    })
    expect(deniaGroup.loras.map((lora) => [lora.id, lora.lookId])).toEqual([
      [a.id, null],
      [b.id, q.id],
    ])
    expect(deniaGroup.loras[0]!.isOwn).toBe(true)
    expect(
      groups.find((group) => group.characterCardId === ron.id),
    ).toMatchObject({ coverUrl: null, looks: [], loras: [] })
  })

  it('给了角色只取那一位', async () => {
    const denia = await createTestCard(me.id, { name: 'Denia' })
    await createTestCard(me.id, { name: 'Ron' })
    const groups = await listCharacterLoraGroups(me.clerkId, denia.id)
    expect(groups.map((group) => group.characterCardId)).toEqual([denia.id])
  })
})

describe('setLoraCharacters', () => {
  it('整组替换：勾掉的删、新勾的按角色写一行（同一位勾两次只算一次，后一次的造型为准）', async () => {
    const denia = await createTestCard(me.id, { name: 'Denia' })
    const ron = await createTestCard(me.id, { name: 'Ron' })
    const old = await createTestCard(me.id, { name: 'Old' })
    const q = await look(denia.id, { label: 'Q版' })
    const a = await asset('a', { loraUrl: LORA.loraUrl })
    await db.characterCardLora.create({
      data: { characterCardId: old.id, loraAssetId: a.id },
    })

    const groups = await setLoraCharacters(me.clerkId, LORA, [
      pick(denia.id),
      pick(ron.id),
      pick(denia.id, q.id),
    ])

    expect(await links()).toEqual(
      sorted([
        { characterCardId: denia.id, loraAssetId: a.id, lookId: q.id },
        { characterCardId: ron.id, loraAssetId: a.id, lookId: null },
      ]),
    )
    expect(await db.loraAsset.count()).toBe(1)
    expect(
      groups.find((group) => group.characterCardId === ron.id)?.loras,
    ).toHaveLength(1)
    expect(
      groups.find((group) => group.characterCardId === old.id)?.loras,
    ).toEqual([])
  })

  it('没收藏的 LoRA：在你名下记一行但不进库，再收进角色', async () => {
    const denia = await createTestCard(me.id, { name: 'Denia' })

    await setLoraCharacters(me.clerkId, LORA, [pick(denia.id)])

    const row = await db.loraAsset.findFirstOrThrow({
      where: { userId: me.id },
    })
    expect(row).toMatchObject({
      loraUrl: LORA.loraUrl,
      source: 'imported',
      inLibrary: false,
    })
    expect(await links()).toEqual([
      { characterCardId: denia.id, loraAssetId: row.id, lookId: null },
    ])
  })

  it('全部勾掉：收藏的只拿掉关联，行留着', async () => {
    const denia = await createTestCard(me.id, { name: 'Denia' })
    const a = await asset('a', { loraUrl: LORA.loraUrl })
    await db.characterCardLora.create({
      data: { characterCardId: denia.id, loraAssetId: a.id },
    })

    await setLoraCharacters(me.clerkId, LORA, [])

    expect(await links()).toEqual([])
    expect(await db.loraAsset.count()).toBe(1)
  })

  it('全部勾掉：只被角色收着、没收藏的那一行随之删掉', async () => {
    const denia = await createTestCard(me.id, { name: 'Denia' })
    const a = await asset('a', { loraUrl: LORA.loraUrl, inLibrary: false })
    await db.characterCardLora.create({
      data: { characterCardId: denia.id, loraAssetId: a.id },
    })

    await setLoraCharacters(me.clerkId, LORA, [])

    expect(await links()).toEqual([])
    expect(await db.loraAsset.count()).toBe(0)
  })

  it('没收藏、也一个角色都没勾：什么都不写', async () => {
    await createTestCard(me.id, { name: 'Denia' })
    await setLoraCharacters(me.clerkId, LORA, [])
    expect(await db.loraAsset.count()).toBe(0)
    expect(await links()).toEqual([])
  })

  it('有角色不是你的（或已删）→ 404，什么都不写', async () => {
    const denia = await createTestCard(me.id, { name: 'Denia' })
    const theirs = await createTestCard(other.id)
    const gone = await createTestCard(me.id, { isDeleted: true })

    for (const bad of [theirs.id, gone.id]) {
      await expect(
        setLoraCharacters(me.clerkId, LORA, [pick(denia.id), pick(bad)]),
      ).rejects.toMatchObject({ httpStatus: 404 })
    }
    expect(await db.loraAsset.count()).toBe(0)
    expect(await links()).toEqual([])
  })

  it('造型不是她的 → 404，什么都不写', async () => {
    const denia = await createTestCard(me.id, { name: 'Denia' })
    const ron = await createTestCard(me.id, { name: 'Ron' })
    const ronLook = await look(ron.id)

    await expect(
      setLoraCharacters(me.clerkId, LORA, [pick(denia.id, ronLook.id)]),
    ).rejects.toMatchObject({ httpStatus: 404 })
    expect(await db.loraAsset.count()).toBe(0)
    expect(await links()).toEqual([])
  })
})
