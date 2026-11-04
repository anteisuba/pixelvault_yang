// @vitest-environment jsdom
/**
 * 真 `useNodeMediaGenerationV4` + 真 `useNodeMediaGeneration`（提交 + 轮询）+ 真角色库；
 * 只假网络（api-client）：出图提交回一个 job，查状态那一条由测试决定何时回、回什么。
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FAKE_GENERATION } from '@/test/api-helpers'

const server = vi.hoisted(() => ({
  submitted: [] as Array<{ advancedParams?: { seed?: number } }>,
  submit: null as null | ((n: number) => unknown),
  status: new Map<string, (value: unknown) => void>(),
}))
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  listCharacterCardsAPI: vi.fn(async () => ({ success: true, data: [] })),
  studioGenerateAPI: vi.fn(async (input) => {
    server.submitted.push(input)
    return server.submit!(server.submitted.length - 1)
  }),
  checkImageGenerationStatusAPI: vi.fn(
    (jobId: string) =>
      new Promise((resolve) => server.status.set(jobId, resolve)),
  ),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock('sonner', () => ({ toast: { warning: vi.fn() } }))

import type { NodeV4, NodeV4Data } from '@/types/node-workflow'

import { useNodeMediaGenerationV4 } from './use-node-media-generation-v4'

const still = {
  id: 'still',
  position: { x: 0, y: 0 },
  data: {
    kind: 'image',
    subtype: 'shot',
    name: 'still',
    status: 'idle',
    createdAt: '2026-10-14T00:00:00.000Z',
    model: { optionId: 'opt', modelId: 'seedance-2.5', adapterType: 'fal' },
    prompt: '走廊全景',
    params: { count: 3 },
  } as NodeV4Data,
} as NodeV4

const completed = (id: string) => ({
  success: true,
  data: {
    status: 'COMPLETED',
    generation: { ...FAKE_GENERATION, id, url: `https://cdn/${id}.png` },
  },
})

beforeEach(() => {
  server.submitted = []
  server.status = new Map()
  server.submit = (n) => ({ success: true, data: { jobId: `job_${n}` } })
})

describe('generateNode · 一次多张并行（spec §3 A1）', () => {
  it('N 枪同时发出；每枪的 job 与回包都带上是第几枪、一共几枪', async () => {
    const onJobCreated = vi.fn()
    const onEach = vi.fn()
    const { result } = renderHook(() => useNodeMediaGenerationV4())
    let done: Promise<unknown> = Promise.resolve()
    await act(async () => {
      done = result.current.generateNode(
        'still',
        { nodes: [still], edges: [] },
        { onJobCreated, onEach },
      )
      for (let i = 0; i < 10; i += 1) await Promise.resolve()
    })
    // ⭐ 第一枪还没回来，三枪都已经发出去了 = 并行。
    expect(server.submitted).toHaveLength(3)
    expect([...server.status.keys()].sort()).toEqual([
      'job_0',
      'job_1',
      'job_2',
    ])
    expect(onJobCreated.mock.calls).toEqual([
      ['job_0', { index: 0, total: 3, jobId: 'job_0' }],
      ['job_1', { index: 1, total: 3, jobId: 'job_1' }],
      ['job_2', { index: 2, total: 3, jobId: 'job_2' }],
    ])
    const answer = (jobId: string, value: unknown) =>
      server.status.get(jobId)!(value)
    await act(async () => {
      // 后发的先回来：版本按回来的顺序落。
      answer('job_2', completed('c'))
      await Promise.resolve()
      answer('job_0', {
        success: true,
        data: { status: 'FAILED', error: 'boom' },
      })
      await Promise.resolve()
      answer('job_1', completed('b'))
      await done
    })
    expect(onEach.mock.calls.map(([, shot]) => shot.jobId)).toEqual([
      'job_2',
      'job_0',
      'job_1',
    ])
    // 有一张成了，整次就交回成的那张。
    await expect(done).resolves.toMatchObject({ success: true })
  })

  it('锁住的种子：第 n 张用 seed + n，⛔ 几张同一颗', async () => {
    server.submit = () => ({ success: false, error: 'x' })
    const seeded = {
      ...still,
      data: {
        kind: 'image',
        subtype: 'shot',
        name: 'still',
        status: 'idle',
        createdAt: '2026-10-14T00:00:00.000Z',
        model: {
          optionId: 'opt',
          modelId: 'nai-v4',
          adapterType: 'novelai',
          providerConfig: { label: 'NovelAI', baseUrl: '' },
        },
        prompt: '走廊全景',
        params: { count: 3, advanced: { seed: 4294967294, steps: 28 } },
      } as NodeV4Data,
    } as NodeV4
    const { result } = renderHook(() => useNodeMediaGenerationV4())
    await act(async () => {
      await result.current.generateNode('still', {
        nodes: [seeded],
        edges: [],
      })
    })
    const seeds = server.submitted.map((input) => input.advancedParams?.seed)
    // 越过上限绕回 0。
    expect(seeds).toEqual([4294967294, 4294967295, 0])
  })
})
