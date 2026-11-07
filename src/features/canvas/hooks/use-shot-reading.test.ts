// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
} from '@/constants/node-types'
import { SHOT_READ_DEFAULT_FIELDS } from '@/constants/shot-reading'
import { applyCanvasBatchV4 } from '@/lib/node-canvas-batch-v4'
import { planShotPull } from '@/lib/shot-pull-plan'
import type { ShotReadTarget } from '@/lib/shot-read-plan'
import { listShotTableNodes } from '@/lib/shot-table-rows'
import type { ApiResult } from '@/lib/api-client/shared'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import {
  NodeWorkflowStateV4Schema,
  type NodeWorkflowStateV4,
} from '@/types/node-workflow'
import type { ShotReadRequest, ShotReadResult } from '@/types/shot-reading'

const readShotsAPI =
  vi.fn<
    (
      request: ShotReadRequest,
      signal?: AbortSignal,
    ) => Promise<ApiResult<ShotReadResult>>
  >()

vi.mock('@/lib/api-client/vision', () => ({
  readShotsAPI: (request: ShotReadRequest, signal?: AbortSignal) =>
    readShotsAPI(request, signal),
}))

const { useShotReading } = await import('./use-shot-reading')

const ids = NODE_ASSISTANT_OP_V4_IDS
let counter = 0
const context = () => ({
  mintId: (prefix: string) => {
    counter += 1
    return `${prefix}${counter}`
  },
})

/** 一张真画布：落表 / 读镜的 op 都过真的 applier。 */
function canvas(shots: number) {
  let state = NodeWorkflowStateV4Schema.parse({
    version: 4,
    nodes: [],
    edges: [],
  }) as NodeWorkflowStateV4
  const batches: NodeAssistantOpV4[][] = []
  const graph = {
    readState: () => state,
    dispatchBatch: (ops: readonly NodeAssistantOpV4[]) => {
      batches.push([...ops])
      const batch = applyCanvasBatchV4(state, ops, context())
      expect(batch.failures).toEqual([])
      state = batch.state
      return batch
    },
  }
  const clip = graph.dispatchBatch([
    {
      op: ids.addNode,
      kind: NODE_MEDIA_KIND_IDS.video,
      subtype: NODE_V4_VIDEO_SUBTYPE_IDS.clip,
      ref: 'clip',
    },
  ])
  const clipId = clip.createdRefs.clip ?? ''
  const plan = planShotPull({
    nodes: state.nodes,
    clipNodeId: clipId,
    ranges: Array.from({ length: shots }, (_, i) => ({
      startSec: i * 2,
      endSec: i * 2 + 2,
    })),
  })
  const pulled = graph.dispatchBatch(plan.ops)
  const targets: ShotReadTarget[] = plan.added.flatMap((range, index) => {
    const nodeId = pulled.createdRefs[plan.refs[index] ?? '']
    return nodeId ? [{ nodeId, ...range }] : []
  })
  batches.length = 0
  const sizes = () =>
    listShotTableNodes(state.nodes).map((node) => node.data.shot?.size ?? null)
  return { graph, targets, batches, sizes, readState: () => state }
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function rowsFor(request: ShotReadRequest): ApiResult<ShotReadResult> {
  return {
    success: true,
    data: {
      rows: request.shots.map((shot) => ({
        number: shot.number,
        size: 'wide',
      })),
    },
  }
}

const START = {
  videoUrl: 'https://cdn.example.com/ref.mp4',
  apiKeyId: 'key-1',
  locale: 'zh' as const,
  fields: SHOT_READ_DEFAULT_FIELDS,
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
  })
}

beforeEach(() => {
  readShotsAPI.mockReset()
})

describe('useShotReading', () => {
  it('一批一批顺序读：上一批没回来不发下一批；每批一步撤销；读完回 idle', async () => {
    const scene = canvas(10)
    const calls: ReturnType<typeof deferred<ApiResult<ShotReadResult>>>[] = []
    readShotsAPI.mockImplementation(() => {
      const call = deferred<ApiResult<ShotReadResult>>()
      calls.push(call)
      return call.promise
    })
    const { result } = renderHook(() => useShotReading(scene.graph))

    act(() => result.current.start({ ...START, targets: scene.targets }))
    expect(readShotsAPI).toHaveBeenCalledTimes(1)
    expect(readShotsAPI.mock.calls[0]?.[0].shots.map((s) => s.number)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ])
    expect(result.current.state).toMatchObject({
      status: 'reading',
      batchIndex: 0,
      batchCount: 2,
      doneShots: 0,
      totalShots: 10,
    })

    await act(async () => {
      calls[0]?.resolve(rowsFor(readShotsAPI.mock.calls[0]![0]))
    })
    await flush()
    expect(scene.batches).toHaveLength(1)
    expect(readShotsAPI).toHaveBeenCalledTimes(2)
    expect(readShotsAPI.mock.calls[1]?.[0].shots.map((s) => s.number)).toEqual([
      9, 10,
    ])
    expect(result.current.state).toMatchObject({
      status: 'reading',
      batchIndex: 1,
      doneShots: 8,
    })

    await act(async () => {
      calls[1]?.resolve(rowsFor(readShotsAPI.mock.calls[1]![0]))
    })
    await flush()
    expect(scene.batches).toHaveLength(2)
    expect(scene.sizes()).toEqual(Array(10).fill('wide'))
    expect(result.current.state).toEqual({ status: 'idle', finished: true })
  })

  it('一批失败就停在那一批：前面填的留着；retry 换 key 从那一批接着读', async () => {
    const scene = canvas(10)
    readShotsAPI
      .mockImplementationOnce(async (request) => rowsFor(request))
      .mockResolvedValueOnce({
        success: false,
        error: 'bad key',
        errorCode: 'PROVIDER_AUTH_FAILED',
      })
    const { result } = renderHook(() => useShotReading(scene.graph))

    act(() => result.current.start({ ...START, targets: scene.targets }))
    await flush()
    await flush()
    expect(result.current.state).toMatchObject({
      status: 'failed',
      batchIndex: 1,
      failure: { error: 'bad key', errorCode: 'PROVIDER_AUTH_FAILED' },
    })
    expect(scene.sizes().filter(Boolean)).toHaveLength(8)

    readShotsAPI.mockImplementationOnce(async (request) => rowsFor(request))
    act(() => result.current.retry('key-2'))
    await flush()
    await flush()
    expect(readShotsAPI).toHaveBeenCalledTimes(3)
    expect(readShotsAPI.mock.calls[2]?.[0]).toMatchObject({
      apiKeyId: 'key-2',
      shots: [{ number: 9 }, { number: 10 }],
    })
    expect(scene.sizes()).toEqual(Array(10).fill('wide'))
    expect(result.current.state).toEqual({ status: 'idle', finished: true })
  })

  it('停下：在读的那批中途掐掉、回来也不填，后面的不再发', async () => {
    const scene = canvas(10)
    const call = deferred<ApiResult<ShotReadResult>>()
    readShotsAPI.mockReturnValueOnce(call.promise)
    const { result } = renderHook(() => useShotReading(scene.graph))

    act(() => result.current.start({ ...START, targets: scene.targets }))
    const signal = readShotsAPI.mock.calls[0]?.[1]
    act(() => result.current.stop())
    expect(signal?.aborted).toBe(true)
    // 停下 ≠ 读完：不带 `finished`（卡边不走合拢那一拍）。
    expect(result.current.state).toEqual({ status: 'idle' })

    await act(async () => {
      call.resolve(rowsFor(readShotsAPI.mock.calls[0]![0]))
    })
    await flush()
    expect(scene.batches).toHaveLength(0)
    expect(readShotsAPI).toHaveBeenCalledTimes(1)
  })

  it('一批里的卡都不是草稿了（撤销了落表 / 都改过）：那批不发，⛔ 不白花 key', async () => {
    const scene = canvas(10)
    scene.graph.dispatchBatch(
      scene.targets.slice(0, 8).map((target) => ({
        op: ids.setShotSpec,
        target: target.nodeId,
        spec: { draft: null },
      })),
    )
    scene.batches.length = 0
    readShotsAPI.mockImplementation(async (request) => rowsFor(request))
    const { result } = renderHook(() => useShotReading(scene.graph))

    act(() => result.current.start({ ...START, targets: scene.targets }))
    await flush()
    await flush()
    expect(readShotsAPI).toHaveBeenCalledTimes(1)
    expect(readShotsAPI.mock.calls[0]?.[0].shots.map((s) => s.number)).toEqual([
      9, 10,
    ])
    expect(result.current.state).toEqual({ status: 'idle', finished: true })
  })

  it('卸载就掐掉在读的那一批', () => {
    const scene = canvas(3)
    readShotsAPI.mockReturnValueOnce(new Promise(() => {}))
    const { result, unmount } = renderHook(() => useShotReading(scene.graph))
    act(() => result.current.start({ ...START, targets: scene.targets }))
    const signal = readShotsAPI.mock.calls[0]?.[1]
    unmount()
    expect(signal?.aborted).toBe(true)
  })
})
