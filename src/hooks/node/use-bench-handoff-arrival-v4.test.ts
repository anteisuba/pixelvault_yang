import { describe, expect, it } from 'vitest'

import { buildBenchHandoffOps } from './use-bench-handoff-arrival-v4'

describe('工作台交过来的那件事落成哪几个 op（P6）', () => {
  it('一张图片卡带提示词、模型、刚出的图；每张参考图一张参考卡连进参考槽', () => {
    const { ops, seeds } = buildBenchHandoffOps({
      projectId: 'project-1',
      prompt: 'a girl',
      modelId: 'seedream-5.0-pro',
      referenceUrls: ['https://cdn.test/a.png', 'https://cdn.test/b.png'],
      result: { url: 'https://cdn.test/out.png', width: 1024, height: 1536 },
    })
    expect(ops.map((op) => op.op)).toEqual([
      'add_node',
      'set_prompt',
      'set_model',
      'add_node',
      'connect',
      'add_node',
      'connect',
    ])
    expect(ops[4]).toMatchObject({
      source: 'ref-1',
      target: 'card',
      slot: 'reference',
    })
    // seeds 只对 add_node 计数：卡、参考 1、参考 2。
    expect(seeds).toEqual([
      {
        media: {
          url: 'https://cdn.test/out.png',
          imageSource: 'generated',
          mediaWidth: 1024,
          mediaHeight: 1536,
        },
      },
      { media: { url: 'https://cdn.test/a.png', imageSource: 'existing' } },
      { media: { url: 'https://cdn.test/b.png', imageSource: 'existing' } },
    ])
  })

  it('空提示词、没模型、还没出图：只落一张空卡', () => {
    const { ops, seeds } = buildBenchHandoffOps({
      projectId: 'new',
      prompt: '  ',
      referenceUrls: [],
    })
    expect(ops.map((op) => op.op)).toEqual(['add_node'])
    expect(seeds).toEqual([undefined])
  })
})
