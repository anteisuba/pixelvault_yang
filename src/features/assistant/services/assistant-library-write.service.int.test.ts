import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { db } from '@/lib/db'
import { createTestUser, resetDatabase } from '@/test/int/db'

import {
  favoriteLora,
  linkLoraToCharacter,
  revertLibraryWrite,
  writeCharacterProfile,
} from './assistant-library-write.service'

/**
 * 新内核改库（第 4b 步）。形状照素材库四条那份：**做 → 撤 → 回到原状**，比的是整份状态。
 * 真库（L2a）：角色卡、造型、LoRA、挂接、「她改了什么」都是库里的行。
 */
let owner = { userId: '', clerkId: '' }
let ids: {
  card: string
  otherCard: string
  defaultLook: string
  winterLook: string
  lora: string
  otherLora: string
}

beforeEach(async () => {
  await resetDatabase()
  const user = await createTestUser()
  owner = { userId: user.id, clerkId: user.clerkId }
  const stranger = await createTestUser()
  const card = await db.characterCard.create({
    data: {
      userId: owner.userId,
      name: '马尔福',
      handle: 'malfoy',
      tags: ['hp'],
      persona: { identity: 'student', speech: 'drawl' },
      looks: {
        create: [
          { isDefault: true, description: 'platinum hair', sortOrder: 0 },
          {
            label: '冬装',
            description: 'scarf',
            tags: ['scarf'],
            sortOrder: 1,
          },
        ],
      },
    },
    include: { looks: { orderBy: { sortOrder: 'asc' } } },
  })
  const otherCard = await db.characterCard.create({
    data: { userId: stranger.id, name: 'Someone else' },
  })
  const lora = (userId: string, name: string, styleCode: string) =>
    db.loraAsset.create({
      data: {
        userId,
        name,
        styleCode,
        triggerWord: 'ink',
        loraUrl: 'https://cdn.example.test/ink.safetensors',
      },
    })
  ids = {
    card: card.id,
    otherCard: otherCard.id,
    defaultLook: card.looks[0]!.id,
    winterLook: card.looks[1]!.id,
    lora: (await lora(owner.userId, 'Ink Lines', 'pv-ink-1')).id,
    otherLora: (await lora(stranger.id, 'Ink Lines', 'pv-ink-2')).id,
  }
})

/** 这几张表里比得上的那几格（⛔ 时间戳、版本号这种每次写都变的不比）。 */
async function snapshot() {
  const [cards, looks, links, loras] = await Promise.all([
    db.characterCard.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        handle: true,
        tags: true,
        persona: true,
        isDeleted: true,
      },
    }),
    db.characterLook.findMany({
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        label: true,
        isDefault: true,
        description: true,
        tags: true,
        referenceSlots: true,
      },
    }),
    db.characterCardLora.findMany({
      select: { characterCardId: true, loraAssetId: true, lookId: true },
    }),
    db.loraAsset.findMany({
      orderBy: { styleCode: 'asc' },
      select: { id: true, name: true, inLibrary: true, coverImageUrl: true },
    }),
  ])
  return { cards, looks, links, loras }
}

const personaOf = async (id: string) =>
  (await db.characterCard.findUniqueOrThrow({ where: { id } })).persona

describe('新内核改库：做 → 撤 → 回到原状（真库）', () => {
  it('改设定（含「一句外观」落在默认造型上），撤销原样写回', async () => {
    const before = await snapshot()
    const outcome = await writeCharacterProfile(owner, {
      character: '马尔福',
      fields: [
        { field: 'speech', text: 'sneers a lot' },
        { field: 'look', text: 'slicked-back hair' },
      ],
    })
    expect(outcome.ok).toBe(true)
    expect(await personaOf(ids.card)).toMatchObject({
      identity: 'student',
      speech: 'sneers a lot',
    })
    expect(
      (
        await db.characterLook.findUniqueOrThrow({
          where: { id: ids.defaultLook },
        })
      ).description,
    ).toBe('slicked-back hair')
    if (!outcome.ok) return
    expect(outcome.payload.summary).toContain('角色·马尔福')
    await revertLibraryWrite(owner.userId, outcome.inverse)
    expect(await snapshot()).toEqual(before)
  })

  it('钉住的格你叫助手改也拦下，什么都不写（第 ② 步）', async () => {
    await db.characterCard.update({
      where: { id: ids.card },
      data: { extensions: { 'pv.pinnedFields': ['speech'] } },
    })
    const before = await snapshot()
    const outcome = await writeCharacterProfile(owner, {
      character: '马尔福',
      fields: [{ field: 'speech', text: 'sneers a lot' }],
    })
    expect(outcome.ok).toBe(false)
    expect(await snapshot()).toEqual(before)
    expect(await db.characterCardRevision.count()).toBe(0)
  })

  it('改设定记进「她改了什么」，对话里撤销时那一行一起标成撤回过（C）', async () => {
    const outcome = await writeCharacterProfile(owner, {
      character: '马尔福',
      fields: [{ field: 'speech', text: 'sneers a lot' }],
    })
    const [revision] = await db.characterCardRevision.findMany()
    expect(revision).toMatchObject({
      userId: owner.userId,
      characterCardId: ids.card,
      source: 'CHAT',
      revertedAt: null,
      // 只记改了的那几格。
      before: { speech: 'drawl' },
      after: { speech: 'sneers a lot' },
    })
    if (!outcome.ok) throw new Error('write failed')
    await revertLibraryWrite(owner.userId, outcome.inverse)
    expect(
      (
        await db.characterCardRevision.findUniqueOrThrow({
          where: { id: revision!.id },
        })
      ).revertedAt,
    ).toBeInstanceOf(Date)
  })

  it('开场白、对话示例、口头禅、不会做的事也能直接写（10-26），撤销写回', async () => {
    const before = await snapshot()
    const outcome = await writeCharacterProfile(owner, {
      character: '马尔福',
      fields: [
        { field: 'opening', text: '哼，又是你。' },
        {
          field: 'examples',
          text: '<START>\n{{user}}: 谢谢你\n{{char}}: 别以为我会说不客气。\n<START>\n{{char}}: 走开。',
        },
        { field: 'catchphrases', text: '「哼」\n我父亲会听说这件事的' },
        { field: 'boundaries', text: '不当着别人面道谢' },
      ],
    })
    expect(outcome.ok).toBe(true)
    expect(await personaOf(ids.card)).toMatchObject({
      identity: 'student',
      opening: '哼，又是你。',
      examples: [
        { user: '谢谢你', reply: '别以为我会说不客气。' },
        { user: '', reply: '走开。' },
      ],
      catchphrases: ['哼', '我父亲会听说这件事的'],
      boundaries: '不当着别人面道谢',
    })
    if (!outcome.ok) return
    await revertLibraryWrite(owner.userId, outcome.inverse)
    expect(await snapshot()).toEqual(before)
  })

  it('LoRA 加到角色的某套造型，撤销把这一条拿掉', async () => {
    const before = await snapshot()
    const outcome = await linkLoraToCharacter(owner, {
      lora: 'ink lines',
      character: '马尔福',
      look: '冬装',
    })
    expect(outcome.ok).toBe(true)
    expect((await snapshot()).links).toEqual([
      {
        characterCardId: ids.card,
        loraAssetId: ids.lora,
        lookId: ids.winterLook,
      },
    ])
    if (!outcome.ok) return
    expect(await revertLibraryWrite(owner.userId, outcome.inverse)).toEqual({
      revertedCount: 1,
      skipped: 0,
    })
    expect(await snapshot()).toEqual(before)
  })

  it('取消收藏 LoRA 只移出收藏（不删行），撤销收回来', async () => {
    const before = await snapshot()
    const outcome = await favoriteLora(owner, { lora: 'Ink', value: false })
    expect(outcome.ok).toBe(true)
    expect(
      (await db.loraAsset.findUniqueOrThrow({ where: { id: ids.lora } }))
        .inLibrary,
    ).toBe(false)
    // 别人那条同名的不动。
    expect(
      (await db.loraAsset.findUniqueOrThrow({ where: { id: ids.otherLora } }))
        .inLibrary,
    ).toBe(true)
    if (!outcome.ok) return
    await revertLibraryWrite(owner.userId, outcome.inverse)
    expect(await snapshot()).toEqual(before)
  })

  it('⛔ 别人的角色认不出、改不了；别人的 LoRA 撤销也碰不到', async () => {
    const outcome = await writeCharacterProfile(owner, {
      character: 'Someone else',
      fields: [{ field: 'speech', text: 'x' }],
    })
    expect(outcome.ok).toBe(false)
    expect(await personaOf(ids.otherCard)).toBeNull()

    await db.loraAsset.update({
      where: { id: ids.otherLora },
      data: { inLibrary: false },
    })
    expect(
      await revertLibraryWrite(owner.userId, {
        kind: 'favorite_lora',
        loraAssetId: ids.otherLora,
        inLibrary: true,
      }),
    ).toEqual({ revertedCount: 0, skipped: 1 })
    expect(
      (await db.loraAsset.findUniqueOrThrow({ where: { id: ids.otherLora } }))
        .inLibrary,
    ).toBe(false)
  })
})
