/**
 * L2a 真库：她的成长（日记改删、见闻删除连索引、撤回改动、成长页、总览「最近」）。
 * 见闻索引是按意思搜 Worker，在 fetch 边界上假（真 semantic-search.service）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { characterNamespace } from '@/constants/semantic-search'
import { db } from '@/lib/db'
import { fakeSemanticIndex } from '@/test/fake-semantic-index'
import { createTestCard } from '@/test/int/cards'
import { createTestUser, resetDatabase } from '@/test/int/db'
import { CharacterPersonaSchema } from '@/types'

import { indexFindings } from './character-findings.service'
import {
  deleteCharacterFindingForClerkId,
  deleteCharacterJournalForClerkId,
  getCharacterGrowthForClerkId,
  listCharacterRecentActivityForClerkId,
  revertCharacterRevisionForClerkId,
  updateCharacterJournalForClerkId,
} from './character-growth.service'
import { recordCharacterRevision } from './character-revision.service'

const AT = new Date('2026-10-26T10:00:00Z')
const at = (h: number) =>
  new Date(`2026-10-29T${String(h).padStart(2, '0')}:00:00Z`)

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>
let cardId: string

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
  cardId = (await createTestCard(me.id, { name: 'Denia' })).id
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

function journal(
  text: string,
  extra: { cardId?: string; userId?: string; createdAt?: Date } = {},
) {
  return db.characterJournal.create({
    data: {
      userId: extra.userId ?? me.id,
      characterCardId: extra.cardId ?? cardId,
      text,
      ...(extra.createdAt ? { createdAt: extra.createdAt } : {}),
    },
  })
}

function finding(
  title: string,
  extra: { cardId?: string; source?: string; seenAt?: Date } = {},
) {
  return db.characterFinding.create({
    data: {
      userId: me.id,
      characterCardId: extra.cardId ?? cardId,
      source: extra.source ?? 'bilibili',
      url: `https://www.bilibili.com/video/${title}`,
      title,
      note: '先铺冷色再压暖色',
      ...(extra.seenAt ? { seenAt: extra.seenAt } : {}),
    },
  })
}

describe('日记能改能删（第 ③ 步）', () => {
  it('只改自己的；别人的回 null 不动', async () => {
    const mine = await journal('旧的')
    const updated = await updateCharacterJournalForClerkId(
      me.clerkId,
      mine.id,
      {
        text: '新的',
      },
    )
    expect(updated).toEqual({
      id: mine.id,
      text: '新的',
      createdAt: mine.createdAt.toISOString(),
    })

    await expect(
      updateCharacterJournalForClerkId(other.clerkId, mine.id, { text: 'x' }),
    ).resolves.toBeNull()
    expect(
      (await db.characterJournal.findUniqueOrThrow({ where: { id: mine.id } }))
        .text,
    ).toBe('新的')
  })

  it('删只删自己的那篇', async () => {
    const mine = await journal('一篇')
    await expect(
      deleteCharacterJournalForClerkId(other.clerkId, mine.id),
    ).resolves.toBe(false)
    await expect(
      deleteCharacterJournalForClerkId(me.clerkId, mine.id),
    ).resolves.toBe(true)
    expect(await db.characterJournal.count()).toBe(0)
  })
})

describe('getCharacterGrowthForClerkId', () => {
  it('只读自己的卡，日期转成字符串；见闻（认不出的来源不送）、观点（去掉前缀）、出门状态一起回', async () => {
    await journal('今天他画崩了', { createdAt: AT })
    await db.characterCardRevision.create({
      data: {
        userId: me.id,
        characterCardId: cardId,
        source: 'REFLECTION',
        fields: ['speech'],
        before: { speech: '慢吞吞' },
        after: { speech: '慢吞吞，熟了拖长音' },
        reason: '跟他熟了',
        createdAt: AT,
      },
    })
    const kept = await finding('水彩叠色', { seenAt: AT })
    await finding('x', { source: 'myspace' })
    await db.assistantMemory.createMany({
      data: [
        {
          userId: me.id,
          characterCardId: cardId,
          scope: 'CARDS',
          kind: 'FACT',
          text: '观点：厚涂更适合画雨天。',
          createdAt: AT,
        },
        {
          userId: me.id,
          characterCardId: cardId,
          scope: 'CARDS',
          kind: 'FACT',
          text: '他常熬夜',
        },
      ],
    })

    const growth = await getCharacterGrowthForClerkId(me.clerkId, cardId)

    expect(growth?.journals).toEqual([
      expect.objectContaining({
        text: '今天他画崩了',
        createdAt: AT.toISOString(),
      }),
    ])
    expect(growth?.revisions[0]).toMatchObject({
      before: { speech: '慢吞吞' },
      revertedAt: null,
      createdAt: AT.toISOString(),
    })
    expect(growth?.findings.map((row) => row.id)).toEqual([kept.id])
    expect(growth?.findings[0]?.seenAt).toBe(AT.toISOString())
    expect(growth?.opinions).toEqual([
      expect.objectContaining({
        text: '厚涂更适合画雨天。',
        createdAt: AT.toISOString(),
      }),
    ])
    expect(growth?.outing).toMatchObject({ running: null, recent: [] })
  })

  it('不是你的卡 / 已删的卡回 null', async () => {
    const deleted = await createTestCard(me.id, { isDeleted: true })
    await expect(
      getCharacterGrowthForClerkId(other.clerkId, cardId),
    ).resolves.toBeNull()
    await expect(
      getCharacterGrowthForClerkId(me.clerkId, deleted.id),
    ).resolves.toBeNull()
  })
})

describe('deleteCharacterFindingForClerkId', () => {
  it('只删自己的，连同想起用的索引；别人的回 false', async () => {
    const index = fakeSemanticIndex()
    const row = await finding('水彩叠色')
    await indexFindings(cardId, [row])
    expect(Object.keys(index.entries(characterNamespace(cardId)))).toEqual([
      row.id,
    ])

    await expect(
      deleteCharacterFindingForClerkId(other.clerkId, row.id),
    ).resolves.toBe(false)
    expect(await db.characterFinding.count()).toBe(1)

    await expect(
      deleteCharacterFindingForClerkId(me.clerkId, row.id),
    ).resolves.toBe(true)
    expect(await db.characterFinding.count()).toBe(0)
    expect(index.entries(characterNamespace(cardId))).toEqual({})
  })
})

describe('revertCharacterRevisionForClerkId', () => {
  it('撤成了回 reverted（卡名写回），再撤一次回 null', async () => {
    const side = {
      name: 'Denia',
      tags: [],
      persona: CharacterPersonaSchema.parse({}),
      look: null,
    }
    const id = await recordCharacterRevision({
      userId: me.id,
      cardId,
      source: 'CHAT',
      before: side,
      after: { ...side, name: 'Denia2' },
    })
    await db.characterCard.update({
      where: { id: cardId },
      data: { name: 'Denia2' },
    })

    await expect(
      revertCharacterRevisionForClerkId(me.clerkId, id!),
    ).resolves.toEqual({
      reverted: true,
    })
    expect(
      (await db.characterCard.findUniqueOrThrow({ where: { id: cardId } }))
        .name,
    ).toBe('Denia')
    await expect(
      revertCharacterRevisionForClerkId(me.clerkId, id!),
    ).resolves.toBeNull()
  })
})

describe('listCharacterRecentActivityForClerkId', () => {
  it('每位只留最近一件事，按时间排，最多三位；只看没删的卡、没撤回的改动、自己的', async () => {
    const a = cardId
    const b = (await createTestCard(me.id, { name: 'B' })).id
    const c = (await createTestCard(me.id, { name: 'C' })).id
    const d = (await createTestCard(me.id, { name: 'D' })).id
    const gone = (
      await createTestCard(me.id, { name: 'gone', isDeleted: true })
    ).id
    const theirs = (await createTestCard(other.id)).id

    await journal('下雨天', { cardId: a, createdAt: at(9) })
    await journal('学了新歌', { cardId: b, createdAt: at(5) })
    await journal('删掉的卡', { cardId: gone, createdAt: at(12) })
    await journal('别人的', {
      cardId: theirs,
      userId: other.id,
      createdAt: at(13),
    })
    const revision = (
      cardOf: string,
      fields: string[],
      createdAt: Date,
      revertedAt: Date | null = null,
    ) =>
      db.characterCardRevision.create({
        data: {
          userId: me.id,
          characterCardId: cardOf,
          source: 'CHAT',
          fields,
          before: {},
          after: {},
          createdAt,
          revertedAt,
        },
      })
    await revision(a, ['speech'], at(10))
    await revision(c, ['behavior'], at(7))
    await revision(b, ['name'], at(11), at(11))
    await finding('新版本 PV', { cardId: d, seenAt: at(3) })

    const rows = await listCharacterRecentActivityForClerkId(me.clerkId)

    expect(rows).toEqual([
      {
        cardId: a,
        kind: 'revision',
        text: '',
        fields: ['speech'],
        at: at(10).toISOString(),
      },
      {
        cardId: c,
        kind: 'revision',
        text: '',
        fields: ['behavior'],
        at: at(7).toISOString(),
      },
      {
        cardId: b,
        kind: 'journal',
        text: '学了新歌',
        fields: [],
        at: at(5).toISOString(),
      },
    ])
  })
})
