import { describe, expect, it } from 'vitest'

import {
  appendOutputVersion,
  applyMediaPatchOutputs,
  buildOutputsFromLegacy,
  readOutputIndex,
  readOutputUrl,
  readOutputVersions,
  selectOutputVersion,
} from '@/lib/node-output-versions'
import type { NodeV4ImageData } from '@/types/node-workflow'

function imageData(patch: Partial<NodeV4ImageData> = {}): NodeV4ImageData {
  return {
    kind: 'image',
    subtype: 'result',
    name: 'i_a',
    status: 'idle',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...patch,
  } as NodeV4ImageData
}

let seq = 0
const mint = {
  now: '2026-02-02T00:00:00.000Z',
  mintId: () => `ov_${(seq += 1)}`,
}

describe('readOutputVersions：存量的裸 url 读出来是一版', () => {
  it('没有版本表也没有 url → 一版都没有', () => {
    expect(readOutputVersions(imageData())).toEqual([])
  })

  it('只有 url 的存量卡 → 一版（⛔ 读侧不把它写回去）', () => {
    const data = imageData({ url: 'https://cdn/a.png', generationId: 'g1' })
    expect(readOutputVersions(data)).toHaveLength(1)
    expect(readOutputUrl(data)).toBe('https://cdn/a.png')
    expect(data.outputs).toBeUndefined()
  })

  it('越界的 cur 钳回最后一版，⛔ 不显示空卡', () => {
    const data = imageData({
      url: 'https://cdn/b.png',
      outputs: {
        versions: [
          { id: 'ov_1', url: 'https://cdn/a.png', createdAt: 'x' },
          { id: 'ov_2', url: 'https://cdn/b.png', createdAt: 'x' },
        ],
        cur: 9,
      },
    })
    expect(readOutputIndex(data)).toBe(1)
  })
})

describe('appendOutputVersion：追加并切过去', () => {
  it('第一次生成 → 一版，顶层 url 是它的镜像', () => {
    const next = appendOutputVersion(
      imageData(),
      {
        url: 'https://cdn/a.png',
        generationId: 'g1',
        mediaWidth: 100,
        mediaHeight: 50,
      },
      mint,
    )
    expect(next.outputs?.versions).toHaveLength(1)
    expect(next.outputs?.cur).toBe(0)
    expect(next.url).toBe('https://cdn/a.png')
    expect(next.mediaWidth).toBe(100)
  })

  it('第二次生成 → 两版，cur 指最后一版', () => {
    const one = appendOutputVersion(
      imageData(),
      { url: 'https://cdn/a.png' },
      mint,
    )
    const two = appendOutputVersion(one, { url: 'https://cdn/b.png' }, mint)
    expect(two.outputs?.versions.map((v) => v.url)).toEqual([
      'https://cdn/a.png',
      'https://cdn/b.png',
    ])
    expect(two.outputs?.cur).toBe(1)
    expect(two.url).toBe('https://cdn/b.png')
  })

  it('同一个 url 回来两次只是切过去，⛔ 不多一颗一样的小点', () => {
    const one = appendOutputVersion(
      imageData(),
      { url: 'https://cdn/a.png' },
      mint,
    )
    const two = appendOutputVersion(one, { url: 'https://cdn/b.png' }, mint)
    const again = appendOutputVersion(two, { url: 'https://cdn/a.png' }, mint)
    expect(again.outputs?.versions).toHaveLength(2)
    expect(again.outputs?.cur).toBe(0)
    expect(again.url).toBe('https://cdn/a.png')
  })

  it('没有 url 的补丁原样返回', () => {
    const data = imageData()
    expect(appendOutputVersion(data, {}, mint)).toBe(data)
  })

  it('满 64 版时丢最旧的那一版（⛔ 无界增长会让整份 state 落不了库）', () => {
    let data = imageData()
    for (let i = 0; i < 70; i += 1) {
      data = appendOutputVersion(data, { url: `https://cdn/${i}.png` }, mint)
    }
    expect(data.outputs?.versions).toHaveLength(64)
    expect(data.outputs?.versions[0]?.url).toBe('https://cdn/6.png')
    expect(data.url).toBe('https://cdn/69.png')
  })
})

describe('selectOutputVersion：切版本', () => {
  it('切回旧版时**清掉**新版的尺寸，⛔ 不留上一版的数', () => {
    const one = appendOutputVersion(
      imageData(),
      { url: 'https://cdn/wide.png', mediaWidth: 1600, mediaHeight: 900 },
      mint,
    )
    const two = appendOutputVersion(one, { url: 'https://cdn/plain.png' }, mint)
    const back = selectOutputVersion(two, 0)
    expect(back?.url).toBe('https://cdn/wide.png')
    expect(back?.mediaWidth).toBe(1600)
    const forward = selectOutputVersion(back!, 1)
    expect(forward?.mediaWidth).toBeUndefined()
  })

  it('越界返回 null（⛔ 不静默钳到最后一版）', () => {
    const one = appendOutputVersion(
      imageData(),
      { url: 'https://cdn/a.png' },
      mint,
    )
    expect(selectOutputVersion(one, 5)).toBeNull()
  })
})

describe('applyMediaPatchOutputs：回填唯一的写入点', () => {
  it('带 url 的补丁 → 追加一版，尺寸不丢', () => {
    const next = applyMediaPatchOutputs(
      imageData(),
      {
        url: 'https://cdn/a.png',
        sizeBytes: 2048,
        mediaWidth: 1280,
        mediaHeight: 720,
        imageSource: 'existing',
      },
      mint,
    )
    expect(next).toMatchObject({
      url: 'https://cdn/a.png',
      sizeBytes: 2048,
      mediaWidth: 1280,
      mediaHeight: 720,
      imageSource: 'existing',
    })
    expect(next.outputs?.versions[0]?.meta?.sizeBytes).toBe(2048)
  })

  it('只清 job id 的补丁：版本表一个字不动', () => {
    const one = applyMediaPatchOutputs(
      imageData(),
      { url: 'https://cdn/a.png' },
      mint,
    )
    const cleared = applyMediaPatchOutputs(
      { ...one, mediaJobId: 'job_1' },
      { mediaJobId: undefined },
      mint,
    )
    expect(cleared.mediaJobId).toBeUndefined()
    expect(cleared.outputs?.versions).toHaveLength(1)
  })

  it('晚一拍量出来的尺寸补进**当前版**的 meta', () => {
    const one = applyMediaPatchOutputs(
      imageData(),
      { url: 'https://cdn/a.png' },
      mint,
    )
    const measured = applyMediaPatchOutputs(
      one,
      { mediaWidth: 800, mediaHeight: 600 },
      mint,
    )
    expect(measured.outputs?.versions[0]?.meta).toMatchObject({
      mediaWidth: 800,
      mediaHeight: 600,
    })
    // 切走再切回来时读的是 meta —— 不补的话这两个数会被清掉。
    expect(selectOutputVersion(measured, 0)?.mediaWidth).toBe(800)
  })
})

describe('buildOutputsFromLegacy：迁移回填', () => {
  it('单 url → versions[0]', () => {
    const outputs = buildOutputsFromLegacy(
      imageData({ url: 'https://cdn/a.png', generationId: 'g1' }),
    )
    expect(outputs?.versions).toHaveLength(1)
    expect(outputs?.versions[0]?.generationId).toBe('g1')
    expect(outputs?.cur).toBe(0)
  })

  it('空卡不造一张空版本表', () => {
    expect(buildOutputsFromLegacy(imageData())).toBeUndefined()
  })
})

describe('source：这一版从哪来（S5c，spec §4「用这段」）', () => {
  it('带 source 的补丁把来源记在**这一版**上', () => {
    const next = applyMediaPatchOutputs(
      imageData(),
      {
        url: 'https://cdn/clip.mp3',
        source: { kind: 'platformSample', label: '莫宁' },
      },
      mint,
    )
    expect(next.outputs?.versions[0]?.source).toEqual({
      kind: 'platformSample',
      label: '莫宁',
    })
  })

  it('⛔ 不从上一版兜底：下一版没带 source 就是没有来源（它是生成出来的）', () => {
    const one = appendOutputVersion(
      imageData(),
      {
        url: 'https://cdn/clip.mp3',
        source: { kind: 'library', label: '素材库 · 旁白' },
      },
      mint,
    )
    const two = appendOutputVersion(one, { url: 'https://cdn/gen.mp3' }, mint)
    expect(two.outputs?.versions[0]?.source?.kind).toBe('library')
    expect(two.outputs?.versions[1]?.source).toBeUndefined()
  })
})
