import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  db: {
    characterCardRevision: {
      create: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn((args: unknown) => ({ op: 'revision', args })),
      updateMany: vi.fn(),
    },
    characterCard: { update: vi.fn((args: unknown) => ({ op: 'card', args })) },
    characterLook: {
      updateMany: vi.fn((args: unknown) => ({ op: 'look', args })),
    },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
}))

vi.mock('@/lib/db', () => ({ db: mocks.db }))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }))

import { CharacterPersonaSchema } from '@/types'

import {
  diffCharacterSides,
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

beforeEach(() => {
  vi.clearAllMocks()
  mocks.db.characterCardRevision.create.mockResolvedValue({ id: 'rev-1' })
  mocks.db.characterCardRevision.findMany.mockResolvedValue([])
})

describe('diffCharacterSides', () => {
  it('只记改到的格，前后值都留', () => {
    const diff = diffCharacterSides(
      side(),
      side({
        persona: persona({ speech: '爱拖长音', moods: ['慵懒'] }),
        look: { lookId: 'look-1', description: '黑发' },
      }),
    )
    expect(diff.fields).toEqual(['speech', 'moods', 'look'])
    expect(diff.before).toEqual({
      speech: '慢吞吞',
      moods: [],
      look: { lookId: 'look-1', description: '银发' },
    })
    expect(diff.after).toMatchObject({ speech: '爱拖长音', moods: ['慵懒'] })
  })

  it('什么都没变就是空的', () => {
    expect(diffCharacterSides(side(), side()).fields).toEqual([])
  })
})

describe('recordCharacterRevision', () => {
  it('没变不记', async () => {
    const id = await recordCharacterRevision({
      userId: 'u',
      cardId: 'c',
      source: 'CHAT',
      before: side(),
      after: side(),
    })
    expect(id).toBeNull()
    expect(mocks.db.characterCardRevision.create).not.toHaveBeenCalled()
  })

  it('记一行，超过上限的旧行删掉', async () => {
    mocks.db.characterCardRevision.findMany.mockResolvedValue([{ id: 'old' }])
    const id = await recordCharacterRevision({
      userId: 'u',
      cardId: 'c',
      source: 'REFLECTION',
      before: side(),
      after: side({ name: 'Denia2' }),
      reason: '  她觉得这样更顺口  ',
    })
    expect(id).toBe('rev-1')
    expect(mocks.db.characterCardRevision.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fields: ['name'],
          reason: '她觉得这样更顺口',
        }),
      }),
    )
    expect(mocks.db.characterCardRevision.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['old'] } },
    })
  })

  it('写库失败不抛，只回 null', async () => {
    mocks.db.characterCardRevision.create.mockRejectedValue(new Error('down'))
    await expect(
      recordCharacterRevision({
        userId: 'u',
        cardId: 'c',
        source: 'CHAT',
        before: side(),
        after: side({ tags: [] }),
      }),
    ).resolves.toBeNull()
  })
})

describe('revertCharacterRevision', () => {
  it('只把改过的格写回去，其他格保留现在的值', async () => {
    mocks.db.characterCardRevision.findFirst.mockResolvedValue({
      id: 'rev-1',
      fields: ['speech', 'look'],
      before: {
        speech: '慢吞吞',
        look: { lookId: 'look-1', description: '银发' },
      },
      characterCard: {
        id: 'card-1',
        persona: persona({ speech: '爱拖长音', opening: '你来啦' }),
      },
    })
    await expect(revertCharacterRevision('u', 'rev-1')).resolves.toBe(true)
    const ops = mocks.db.$transaction.mock.calls[0]![0] as Array<{
      op: string
      args: { data: Record<string, unknown> }
    }>
    expect(ops.map(({ op }) => op)).toEqual(['card', 'look', 'revision'])
    expect(ops[0]!.args.data.persona).toMatchObject({
      speech: '慢吞吞',
      opening: '你来啦',
    })
    expect(ops[0]!.args.data).not.toHaveProperty('name')
    expect(ops[1]!.args.data).toEqual({ description: '银发' })
  })

  it('撤过的或找不到的不动', async () => {
    mocks.db.characterCardRevision.findFirst.mockResolvedValue(null)
    await expect(revertCharacterRevision('u', 'rev-1')).resolves.toBe(false)
    expect(mocks.db.$transaction).not.toHaveBeenCalled()
  })
})
