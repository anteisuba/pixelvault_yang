/**
 * L2a 真库：角色卡改动记录（记一行 / 超限删旧 / 撤回只写回改过的格）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { CHARACTER_REVISION_LIMITS } from '@/constants/cards/character-revision'
import { db } from '@/lib/db'
import { createTestCard } from '@/test/int/cards'
import { createTestUser, resetDatabase } from '@/test/int/db'
import { CharacterPersonaSchema } from '@/types'

import {
  diffCharacterSides,
  markCharacterRevisionReverted,
  recordCharacterRevision,
  revertCharacterRevision,
  type CharacterRevisionSide,
} from './character-revision.service'

const persona = (patch: Record<string, unknown> = {}) =>
  CharacterPersonaSchema.parse({ speech: '慢吞吞', ...patch })

const side = (
  patch: Partial<CharacterRevisionSide> = {},
): CharacterRevisionSide => ({
  name: 'Denia',
  tags: ['oc'],
  persona: persona(),
  look: { lookId: 'look-1', description: '银发' },
  ...patch,
})

let me: Awaited<ReturnType<typeof createTestUser>>
let card: Awaited<ReturnType<typeof createTestCard>>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  card = await createTestCard(me.id, { name: 'Denia', tags: ['oc'] })
})

describe('diffCharacterSides', () => {
  it('只记改到的格，前后值都留', () => {
    const diff = diffCharacterSides(
      side(),
      side({
        persona: persona({ speech: '爱拖长音', catchphrases: ['懒得动'] }),
        look: { lookId: 'look-1', description: '黑发' },
      }),
    )
    expect(diff.fields).toEqual(['speech', 'catchphrases', 'look'])
    expect(diff.before).toEqual({
      speech: '慢吞吞',
      catchphrases: [],
      look: { lookId: 'look-1', description: '银发' },
    })
    expect(diff.after).toMatchObject({
      speech: '爱拖长音',
      catchphrases: ['懒得动'],
    })
  })

  it('什么都没变就是空的', () => {
    expect(diffCharacterSides(side(), side()).fields).toEqual([])
  })
})

describe('recordCharacterRevision', () => {
  it('没变不记', async () => {
    const id = await recordCharacterRevision({
      userId: me.id,
      cardId: card.id,
      source: 'CHAT',
      before: side(),
      after: side(),
    })
    expect(id).toBeNull()
    expect(await db.characterCardRevision.count()).toBe(0)
  })

  it('记一行（理由去掉首尾空白）；超过每卡上限的最旧那几行删掉', async () => {
    const old = new Date('2026-01-01')
    await db.characterCardRevision.createMany({
      data: Array.from(
        { length: CHARACTER_REVISION_LIMITS.perCard },
        (_, i) => ({
          userId: me.id,
          characterCardId: card.id,
          source: 'CHAT' as const,
          fields: ['name'],
          before: {},
          after: {},
          createdAt: new Date(old.getTime() + i * 1000),
        }),
      ),
    })
    const oldest = await db.characterCardRevision.findFirstOrThrow({
      orderBy: { createdAt: 'asc' },
    })

    const id = await recordCharacterRevision({
      userId: me.id,
      cardId: card.id,
      source: 'REFLECTION',
      before: side(),
      after: side({ name: 'Denia2' }),
      reason: '  她觉得这样更顺口  ',
    })

    const row = await db.characterCardRevision.findUniqueOrThrow({
      where: { id: id! },
    })
    expect(row).toMatchObject({
      source: 'REFLECTION',
      fields: ['name'],
      before: { name: 'Denia' },
      after: { name: 'Denia2' },
      reason: '她觉得这样更顺口',
    })
    expect(await db.characterCardRevision.count()).toBe(
      CHARACTER_REVISION_LIMITS.perCard,
    )
    expect(
      await db.characterCardRevision.findUnique({ where: { id: oldest.id } }),
    ).toBeNull()
  })

  it('写库失败（卡不存在）不抛，只回 null', async () => {
    await expect(
      recordCharacterRevision({
        userId: me.id,
        cardId: '00000000-0000-0000-0000-000000000000',
        source: 'CHAT',
        before: side(),
        after: side({ tags: [] }),
      }),
    ).resolves.toBeNull()
  })
})

describe('revertCharacterRevision', () => {
  it('只把改过的格写回去，其他格保留现在的值；造型说明写回；这一行标成撤过', async () => {
    const look = await db.characterLook.create({
      data: { characterCardId: card.id, description: '黑发' },
    })
    await db.characterCard.update({
      where: { id: card.id },
      data: {
        name: '现在的名字',
        persona: persona({ speech: '爱拖长音', opening: '你来啦' }),
      },
    })
    const id = await recordCharacterRevision({
      userId: me.id,
      cardId: card.id,
      source: 'CHAT',
      before: side({ look: { lookId: look.id, description: '银发' } }),
      after: side({
        persona: persona({ speech: '爱拖长音' }),
        look: { lookId: look.id, description: '黑发' },
      }),
    })

    await expect(revertCharacterRevision(me.id, id!)).resolves.toBe(true)

    const row = await db.characterCard.findUniqueOrThrow({
      where: { id: card.id },
    })
    expect(row.name).toBe('现在的名字')
    expect(row.version).toBe(2)
    expect(row.persona).toMatchObject({ speech: '慢吞吞', opening: '你来啦' })
    expect(
      (await db.characterLook.findUniqueOrThrow({ where: { id: look.id } }))
        .description,
    ).toBe('银发')
    const revision = await db.characterCardRevision.findUniqueOrThrow({
      where: { id: id! },
    })
    expect(revision.revertedAt).not.toBeNull()
  })

  it('撤过的、别人的、找不到的不动', async () => {
    const id = await recordCharacterRevision({
      userId: me.id,
      cardId: card.id,
      source: 'CHAT',
      before: side(),
      after: side({ name: 'Denia2' }),
    })
    const other = await createTestUser()

    await expect(revertCharacterRevision(other.id, id!)).resolves.toBe(false)
    await expect(revertCharacterRevision(me.id, 'missing')).resolves.toBe(false)
    await markCharacterRevisionReverted(me.id, id!)
    await expect(revertCharacterRevision(me.id, id!)).resolves.toBe(false)

    const row = await db.characterCard.findUniqueOrThrow({
      where: { id: card.id },
    })
    expect(row).toMatchObject({ name: 'Denia', version: 1 })
  })
})
