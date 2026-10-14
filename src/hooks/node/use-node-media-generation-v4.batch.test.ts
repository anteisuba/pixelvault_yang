import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const generate = vi.hoisted(() => vi.fn())

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock('sonner', () => ({ toast: { warning: vi.fn() } }))
vi.mock('@/hooks/node/use-node-media-generation', () => ({
  useNodeMediaGeneration: () => ({
    generate,
    isLoading: false,
    error: null,
    reset: vi.fn(),
  }),
}))
vi.mock('@/hooks/cards/use-character-library', () => ({
  useCharacterLibrary: () => ({ cards: [] }),
}))

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

describe('generateNode · 一次多张并行（spec §3 A1）', () => {
  it('N 枪同时发出；每枪的 job 与回包都带上是第几枪、一共几枪', async () => {
    const resolvers: ((value: unknown) => void)[] = []
    generate.mockImplementation(
      (_input, options: { onJobCreated(jobId: string): void }) => {
        const index = resolvers.length
        options.onJobCreated(`job_${index}`)
        return new Promise((resolve) => resolvers.push(resolve))
      },
    )
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
      await Promise.resolve()
      await Promise.resolve()
    })
    // ⭐ 第一枪还没回来，三枪都已经发出去了 = 并行。
    expect(generate).toHaveBeenCalledTimes(3)
    expect(onJobCreated.mock.calls).toEqual([
      ['job_0', { index: 0, total: 3, jobId: 'job_0' }],
      ['job_1', { index: 1, total: 3, jobId: 'job_1' }],
      ['job_2', { index: 2, total: 3, jobId: 'job_2' }],
    ])
    const ok = (id: string) => ({
      success: true,
      mediaUrl: `https://cdn/${id}.png`,
      generation: { id },
    })
    await act(async () => {
      // 后发的先回来：版本按回来的顺序落。
      resolvers[2]?.(ok('c'))
      resolvers[0]?.({ success: false, error: 'boom' })
      resolvers[1]?.(ok('b'))
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
})
