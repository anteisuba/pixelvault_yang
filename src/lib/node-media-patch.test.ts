import { describe, expect, it } from 'vitest'

import type { NodeV4ImageData } from '@/types/node-workflow'

import {
  applyNodeMediaPatch,
  hasPendingMediaJob,
  pendingJobPatch,
  pendingMediaJobIds,
  settledJobPatch,
} from './node-media-patch'

const NOW = '2026-10-14T00:00:00.000Z'

function image(data: Partial<NodeV4ImageData> = {}): NodeV4ImageData {
  return {
    kind: 'image',
    subtype: 'shot',
    name: 'i',
    status: 'idle',
    createdAt: NOW,
    ...data,
  } as NodeV4ImageData
}

let minted = 0
const ctx = { now: NOW, mintId: () => `ov_${(minted += 1)}` }

describe('一批并行在飞的增删（spec §3 A1）', () => {
  it('单枪写 mediaJobId，一批写增删键', () => {
    expect(pendingJobPatch({ index: 0, total: 1 }, 'j')).toEqual({
      mediaJobId: 'j',
    })
    expect(pendingJobPatch({ index: 1, total: 4 }, 'j')).toEqual({
      addBatchJob: 'j',
    })
    expect(settledJobPatch({ index: 0, total: 1 })).toEqual({
      mediaJobId: undefined,
    })
    expect(settledJobPatch({ index: 1, total: 4, jobId: 'j' })).toEqual({
      settleBatchJob: 'j',
    })
    // 一批里 job 还没建好就失败了：没有格可摘。
    expect(settledJobPatch({ index: 1, total: 4 })).toEqual({})
  })

  it('几单在最新的 data 上逐个加进来、逐个摘掉；增删键⛔ 摊进 data', () => {
    let data = image()
    data = applyNodeMediaPatch(data, { addBatchJob: 'a' }, ctx)
    data = applyNodeMediaPatch(data, { addBatchJob: 'b' }, ctx)
    expect(data.mediaBatchJobIds).toEqual(['a', 'b'])
    expect(data.status).toBe('running')
    expect(hasPendingMediaJob(data)).toBe(true)
    expect('addBatchJob' in data).toBe(false)

    data = applyNodeMediaPatch(
      data,
      { url: 'https://cdn/a.png', settleBatchJob: 'a' },
      ctx,
    )
    expect(pendingMediaJobIds(data)).toEqual(['b'])
    // 还有一单在飞：落了一张也仍是「在跑」。
    expect(data.status).toBe('running')
    expect('settleBatchJob' in data).toBe(false)

    data = applyNodeMediaPatch(
      data,
      { url: 'https://cdn/b.png', settleBatchJob: 'b' },
      ctx,
    )
    expect(data.mediaBatchJobIds).toBeUndefined()
    expect(data.status).toBe('done')
    expect(data.outputs?.versions.map((version) => version.url)).toEqual([
      'https://cdn/a.png',
      'https://cdn/b.png',
    ])
  })

  it('最后一单被取消：有图算完成，没图回到空闲', () => {
    const empty = applyNodeMediaPatch(
      image({ status: 'running', mediaBatchJobIds: ['a'] }),
      { settleBatchJob: 'a' },
      ctx,
    )
    expect(empty.status).toBe('idle')
    const withImage = applyNodeMediaPatch(
      image({
        status: 'running',
        url: 'https://cdn/x.png',
        mediaBatchJobIds: ['a'],
      }),
      { settleBatchJob: 'a' },
      ctx,
    )
    expect(withImage.status).toBe('done')
  })

  it('单枪那一单与一批的几单都算在飞', () => {
    expect(
      pendingMediaJobIds({ mediaJobId: 's', mediaBatchJobIds: ['a'] }),
    ).toEqual(['s', 'a'])
    expect(hasPendingMediaJob({})).toBe(false)
  })
})
