import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { V3Context } from '@/services/kernel/assistant-v3-steps.service'

vi.mock('server-only', () => ({}))

const { recent, characters } = vi.hoisted(() => ({
  recent: [] as { id: string; name: string }[],
  characters: [] as { id: string; name: string }[],
}))
vi.mock('@/services/node/node-workflow.service', () => ({
  listRecentNodeWorkflowProjectsForUser: async () => recent,
}))
vi.mock('@/services/assistant-library-write.service', () => ({
  findOwnCharacter: async (_userId: string, name: string) =>
    characters.find((card) => card.name === name) ?? null,
}))

import { arrivedAt, openedOutput, planOpen } from './open'

function contextOn(
  workspaceKey: string,
  cards?: {
    characters: { id: string; name: string }[]
    open?: { id: string; name: string }
  },
): V3Context {
  return {
    clerkId: 'clerk-1',
    prepared: { user: { id: 'user-1' } },
    request: { workspaceKey, snapshot: cards ? { cards } : {} },
    handles: {
      idOf: (handle: string) => (handle === 'char-aa11' ? 'denia' : null),
    },
  } as unknown as V3Context
}

beforeEach(() => {
  recent.length = 0
  characters.length = 0
})

describe('planOpen（第 9e 步）', () => {
  it('画布默认开最近那块；一块都没有就新建；说「new」才新建', async () => {
    recent.push({ id: 'proj-2', name: '雨夜' }, { id: 'proj-1', name: '旧的' })
    const here = contextOn('image-natural')
    expect((await planOpen(here, { bench: 'canvas' })).opening).toEqual({
      target: { workspace: 'canvas', projectId: 'proj-2' },
      label: 'the canvas 「雨夜」',
    })
    expect(
      (await planOpen(here, { bench: 'canvas', canvas: 'new' })).opening
        ?.target,
    ).toEqual({ workspace: 'canvas', projectId: 'new' })
    recent.length = 0
    expect((await planOpen(here, { bench: 'canvas' })).opening?.target).toEqual(
      { workspace: 'canvas', projectId: 'new' },
    )
  })

  it('已经在画布上：不白跳（要另一块得说 new）', async () => {
    const result = await planOpen(contextOn('canvas:proj-1'), {
      bench: 'canvas',
    })
    expect(result.opening).toBeUndefined()
    expect(result.output).toContain('on the canvas already')
  })

  it('角色页按名字认（服务端查），认不出就报错，⛔ 不收模型写的 id', async () => {
    characters.push({ id: 'card-9', name: '马尔福' })
    const here = contextOn('image-natural')
    expect(
      (await planOpen(here, { bench: 'character', character: '角色·马尔福' }))
        .opening,
    ).toEqual({
      target: { workspace: 'cards', characterId: 'card-9' },
      label: 'the character page (马尔福 open)',
    })
    const unknown = await planOpen(here, {
      bench: 'character',
      character: '哈利',
    })
    expect(unknown.error).toBe(true)
    expect(unknown.opening).toBeUndefined()
  })

  it('角色页上：页上的句柄直接认；开着的就是她时不白跳', async () => {
    const cards = {
      characters: [{ id: 'denia', name: 'Denia' }],
      open: { id: 'denia', name: 'Denia' },
    }
    const result = await planOpen(contextOn('cards', cards), {
      bench: 'character',
      character: 'char-aa11',
    })
    expect(result.opening).toBeUndefined()
    expect(result.output).toContain('with Denia open')
  })
})

describe('到了没有', () => {
  it('画布要那一块；新画布认任何一块；别的台只看台', () => {
    const canvas = { workspace: 'canvas' as const, projectId: 'proj-2' }
    expect(arrivedAt(contextOn('canvas:proj-2'), canvas)).toBe(true)
    expect(arrivedAt(contextOn('canvas:proj-1'), canvas)).toBe(false)
    expect(
      arrivedAt(contextOn('canvas:proj-9'), {
        workspace: 'canvas',
        projectId: 'new',
      }),
    ).toBe(true)
    expect(arrivedAt(contextOn('video'), { workspace: 'video' })).toBe(true)
    expect(arrivedAt(contextOn('image-tags'), { workspace: 'video' })).toBe(
      false,
    )
  })

  it('没到：结果如实说现在在哪，⛔ 不给板子', () => {
    const board = vi.fn(() => 'BOARD')
    const result = openedOutput(
      contextOn('image-natural'),
      { target: { workspace: 'video' }, label: 'the video bench' },
      board,
    )
    expect(result.error).toBe(true)
    expect(result.output).toContain('on the image bench')
    expect(board).not.toHaveBeenCalled()
  })
})
