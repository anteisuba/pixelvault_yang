/**
 * L2a 真库：素材卡服务（context-cards.service）。不假任何自有模块，核库里的行与返回值。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  CONTEXT_CARD_IMAGE_ROLE_IDS,
  CONTEXT_CARD_LIMITS,
} from '@/constants/context-cards'
import { db } from '@/lib/db'
import {
  ContextCardLimitError,
  createContextCard,
  deleteContextCard,
  getContextCardForClerkId,
  listContextCards,
  parseContextCardImages,
  replaceContextCardImages,
  setContextCardPinned,
  updateContextCard,
} from '@/services/context-cards.service'
import { createTestUser, resetDatabase } from '@/test/int/db'

const SHEET = {
  url: 'https://cdn.example.com/context-cards/u1/sheet.png',
  role: CONTEXT_CARD_IMAGE_ROLE_IDS.sheet,
  sourceRef: 'official site',
}

const INPUT = {
  kind: 'character' as const,
  name: 'Sigrika',
  summary: 'Silver hair, gold eyes.',
  body: '## Appearance\nSilver hair.',
  pinnedScopes: [] as string[],
}

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
})

describe('context-cards.service（真库）', () => {
  it('新建：从零张图开始落库；按 clerkId 读回', async () => {
    const card = await createContextCard(me.id, {
      ...INPUT,
      pinnedScopes: ['video', 'video'],
    })
    expect(card).toMatchObject({
      name: 'Sigrika',
      status: 'confirmed',
      images: [],
      pinnedScopes: ['video'],
    })
    expect(
      await db.contextCard.findUniqueOrThrow({ where: { id: card.id } }),
    ).toMatchObject({ userId: me.id, kind: 'CHARACTER', status: 'CONFIRMED' })
    expect(await getContextCardForClerkId(me.clerkId, card.id)).toMatchObject({
      id: card.id,
    })
    expect(await getContextCardForClerkId(other.clerkId, card.id)).toBeNull()
  })

  it('列表：只列我的已确认卡，最近改过的在前；kind / 常挂域 / proposed 都能筛', async () => {
    const a = await createContextCard(me.id, INPUT)
    const b = await createContextCard(me.id, {
      ...INPUT,
      kind: 'style',
      name: 'Ink',
      pinnedScopes: ['image'],
    })
    await createContextCard(me.id, {
      ...INPUT,
      name: 'Draft',
      status: 'proposed',
    })
    await createContextCard(other.id, INPUT)
    await updateContextCard(me.id, a.id, { summary: 'touched' })

    expect((await listContextCards(me.id)).map((c) => c.id)).toEqual([
      a.id,
      b.id,
    ])
    expect(
      (await listContextCards(me.id, { kind: 'style' })).map((c) => c.id),
    ).toEqual([b.id])
    expect(
      (await listContextCards(me.id, { pinnedScope: 'image' })).map(
        (c) => c.id,
      ),
    ).toEqual([b.id])
    expect(
      (await listContextCards(me.id, { status: 'proposed' })).map(
        (c) => c.name,
      ),
    ).toEqual(['Draft'])
  })

  it('库里一张图的 role 不认识：只丢那一张，卡照样读得出来', async () => {
    const card = await createContextCard(me.id, INPUT)
    await db.contextCard.update({
      where: { id: card.id },
      data: { images: [{ url: SHEET.url, role: 'mood-board' }, SHEET] },
    })
    const [read] = await listContextCards(me.id)
    expect(read.images).toEqual([SHEET])
    expect(parseContextCardImages('nope')).toEqual([])
  })

  it('撞上限抛 ContextCardLimitError 不写库；待确认的不占名额', async () => {
    await db.contextCard.createMany({
      data: Array.from({ length: CONTEXT_CARD_LIMITS.maxPerUser }, (_, i) => ({
        userId: me.id,
        kind: 'CHARACTER' as const,
        name: `c${i}`,
        summary: 's',
        body: 'b',
      })),
    })
    await expect(createContextCard(me.id, INPUT)).rejects.toBeInstanceOf(
      ContextCardLimitError,
    )
    expect(await db.contextCard.count()).toBe(CONTEXT_CARD_LIMITS.maxPerUser)
    await db.contextCard.updateMany({
      where: { name: 'c0' },
      data: { status: 'PROPOSED' },
    })
    await expect(createContextCard(me.id, INPUT)).resolves.toMatchObject({
      name: 'Sigrika',
    })
  })

  it('改：只写给了的字段；常挂按格加减、保住别的域；别人的卡回 null 不动', async () => {
    const card = await createContextCard(me.id, {
      ...INPUT,
      pinnedScopes: ['video'],
      negative: 'air ripples',
    })
    await updateContextCard(me.id, card.id, { status: 'proposed' })
    expect(
      await db.contextCard.findUniqueOrThrow({ where: { id: card.id } }),
    ).toMatchObject({
      status: 'PROPOSED',
      name: 'Sigrika',
      negative: 'air ripples',
    })

    expect(
      (await setContextCardPinned(me.id, card.id, 'image', true))!.pinnedScopes,
    ).toEqual(['video', 'image'])
    expect(
      (await setContextCardPinned(me.id, card.id, 'video', false))!
        .pinnedScopes,
    ).toEqual(['image'])

    expect(
      await updateContextCard(other.id, card.id, { name: 'stolen' }),
    ).toBeNull()
    expect(
      await replaceContextCardImages(other.id, card.id, [SHEET]),
    ).toBeNull()
    expect(
      (await db.contextCard.findUniqueOrThrow({ where: { id: card.id } })).name,
    ).toBe('Sigrika')

    expect(
      (await replaceContextCardImages(me.id, card.id, [SHEET]))!.images,
    ).toEqual([SHEET])
  })

  it('删：只删得掉自己的，删不到是 false', async () => {
    const mine = await createContextCard(me.id, INPUT)
    const theirs = await createContextCard(other.id, INPUT)
    expect(await deleteContextCard(me.id, theirs.id)).toBe(false)
    expect(await deleteContextCard(me.id, mine.id)).toBe(true)
    expect(await deleteContextCard(me.id, mine.id)).toBe(false)
    expect(await db.contextCard.count()).toBe(1)
  })
})
