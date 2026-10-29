import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { V3Context } from '@/services/kernel/assistant-v3-steps.service'

vi.mock('server-only', () => ({}))

const { recent } = vi.hoisted(() => ({
  recent: [] as { id: string; name: string }[],
}))
vi.mock('@/services/node/node-workflow.service', () => ({
  listRecentNodeWorkflowProjectsForUser: async () => recent,
}))
vi.mock('@/features/assistant/workspace.service', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/features/assistant/workspace.service')
  >()),
  resolvePicture: async (_owner: unknown, raw: string) =>
    raw === '图_012'
      ? { generationId: 'gen-12', url: 'https://x/12.png', label: '图_012' }
      : null,
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

  it('没有角色页（10-26）：bench 里不收 character', async () => {
    const { OpenInputSchema } = await import('./tools')
    expect(OpenInputSchema.safeParse({ bench: 'character' }).success).toBe(
      false,
    )
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

describe('库里翻给你看（owner 10-28）', () => {
  function withView(workspaceKey: string, libraryView: unknown): V3Context {
    const context = contextOn(workspaceKey)
    ;(context.request as { libraryView?: unknown }).libraryView = libraryView
    return context
  }

  it('台不动：带着库、按编号认出那张图的 id', async () => {
    const result = await planOpen(contextOn('lora'), {
      bench: 'library',
      library: 'assets',
      show: '图_012',
    })
    expect(result.opening?.target).toEqual({
      workspace: 'lora',
      library: { library: 'assets', itemId: 'gen-12', itemName: '图_012' },
    })
  })

  it('角色 / 提示词只带名字；搜索词与 LoRA 那一格照收', async () => {
    expect(
      (
        await planOpen(contextOn('image-natural'), {
          bench: 'library',
          library: 'characters',
          show: '角色·Denia',
          search: '猫耳',
        })
      ).opening?.target.library,
    ).toEqual({ library: 'cards', itemName: 'Denia', search: '猫耳' })
    expect(
      (
        await planOpen(contextOn('lora'), {
          bench: 'library',
          library: 'loras',
          section: 'trained',
        })
      ).opening?.target.library,
    ).toEqual({ library: 'lora', section: 'trained' })
  })

  it('认不出的图、素材库里按名字、缺 library：如实退回', async () => {
    const here = contextOn('lora')
    expect(
      (
        await planOpen(here, {
          bench: 'library',
          library: 'assets',
          show: '图_999',
        })
      ).error,
    ).toBe(true)
    expect(
      (
        await planOpen(here, {
          bench: 'library',
          library: 'assets',
          show: '雨夜',
        })
      ).error,
    ).toBe(true)
    expect((await planOpen(here, { bench: 'library' })).error).toBe(true)
  })

  it('到没到：那一样打开了或就在屏上、搜索词对上；结果是屏上那一页', () => {
    const target = {
      workspace: 'lora' as const,
      library: { library: 'cards' as const, itemName: 'Denia', search: '猫耳' },
    }
    const arrived = withView('lora', {
      library: 'cards',
      screen: { kind: 'character', search: '猫耳', visible: ['Denia', 'Mia'] },
    })
    expect(arrivedAt(arrived, target)).toBe(true)
    expect(
      arrivedAt(
        withView('lora', {
          library: 'cards',
          screen: { kind: 'character', visible: ['Denia'] },
        }),
        target,
      ),
    ).toBe(false)
    const output = openedOutput(
      arrived,
      { target, label: 'their character library' },
      () => 'BOARD',
    )
    expect(output.error).toBe(false)
    expect(output.output).toContain('Search box: "猫耳"')
    expect(output.output).not.toContain('BOARD')
  })
})
