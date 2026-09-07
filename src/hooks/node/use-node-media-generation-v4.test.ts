import { describe, expect, it } from 'vitest'

import { NODE_SLOT_IDS, NODE_SLOT_OUTPUT_IDS } from '@/constants/node-slots'
import { V4_SLOT_ISSUE_IDS } from '@/lib/node-slot-payload'
import type {
  NodeV4,
  NodeV4Data,
  NodeWorkflowEdgeV4,
} from '@/types/node-workflow'

import { planV4Generation } from './use-node-media-generation-v4'

const NOW = '2026-09-07T00:00:00.000Z'
const MODEL = {
  optionId: 'opt',
  modelId: 'seedance-2.5',
  adapterType: 'fal',
  apiKeyId: 'key-1',
} as NodeV4Data extends { model?: infer M } ? NonNullable<M> : never

function node(
  id: string,
  data: Partial<NodeV4Data> & { kind: NodeV4Data['kind'] },
): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: { name: id, status: 'idle', createdAt: NOW, ...data } as NodeV4Data,
  }
}

function edge(
  id: string,
  source: string,
  target: string,
  slot: NodeWorkflowEdgeV4['slot'],
): NodeWorkflowEdgeV4 {
  return {
    id,
    source,
    sourceHandle: NODE_SLOT_OUTPUT_IDS.out,
    target,
    slot,
  }
}

const first = node('first', {
  kind: 'image',
  subtype: 'shot',
  url: 'https://cdn/first.png',
})
const last = node('last', {
  kind: 'image',
  subtype: 'shot',
  url: 'https://cdn/last.png',
})
const character = node('char', {
  kind: 'image',
  subtype: 'character',
  name: '阿岚',
  url: 'https://cdn/char.png',
})
const voice = node('v', {
  kind: 'audio',
  subtype: 'voice',
  url: 'https://cdn/v.mp3',
  ownerName: '阿岚',
})
const script = node('t1', {
  kind: 'text',
  subtype: 'shotNote',
  body: '她回头',
  defaultRole: 'script',
})
const style = node('t2', {
  kind: 'text',
  subtype: 'rule',
  body: '胶片颗粒',
  defaultRole: 'style',
})
const shot = node('shot', {
  kind: 'video',
  subtype: 'shot',
  label: '走廊',
  prompt: '镜头缓推',
  model: MODEL,
  negativePrompt: '模糊',
  params: { aspectRatio: '16:9', resolution: '1080p', duration: '8', seed: 7 },
})

const graph = {
  nodes: [first, last, character, voice, script, style, shot],
  edges: [
    edge('e1', 'first', 'shot', NODE_SLOT_IDS.firstFrame),
    edge('e2', 'last', 'shot', NODE_SLOT_IDS.lastFrame),
    edge('e3', 'char', 'shot', NODE_SLOT_IDS.reference),
    edge('e4', 'v', 'shot', NODE_SLOT_IDS.voice),
    edge('e5', 't1', 'shot', NODE_SLOT_IDS.text),
    edge('e6', 't2', 'shot', NODE_SLOT_IDS.text),
  ],
}

describe('planV4Generation · 视频', () => {
  const plan = planV4Generation('shot', graph)!

  it('首帧/尾帧/参考/语音各落各的位置，档位原样带过去', () => {
    expect(plan.kind).toBe('video')
    expect(plan.referenceImages).toEqual([
      'https://cdn/first.png',
      'https://cdn/last.png',
      'https://cdn/char.png',
    ])
    expect(plan.audioUrls).toEqual(['https://cdn/v.mp3'])
    expect(plan.audioBindings).toEqual([
      { url: 'https://cdn/v.mp3', characterName: '阿岚' },
    ])
    expect(plan.aspectRatio).toBe('16:9')
    expect(plan.resolution).toBe('1080p')
    expect(plan.duration).toBe(8)
    expect(plan.seed).toBe(7)
    expect(plan.negativePrompt).toBe('模糊')
  })

  it('三类文本分流：剧本进正文，风格约束排在最后', () => {
    expect(plan.prompt).toBe('她回头\n\n镜头缓推\n\n胶片颗粒')
  })

  it('填满的镜头没有校验问题', () => {
    expect(plan.issues).toEqual([])
  })
})

describe('planV4Generation · 其余分支', () => {
  it('文本节点没有生成落点 → null', () => {
    expect(planV4Generation('t1', graph)).toBeNull()
  })

  it('没选模型 → null（⛔ 不替用户代选一个再发出去）', () => {
    const noModel = node('n', { kind: 'image', subtype: 'shot' })
    expect(planV4Generation('n', { nodes: [noModel], edges: [] })).toBeNull()
  })

  it('图：参考槽的图进 referenceImages，文本进正文', () => {
    const still = node('still', {
      kind: 'image',
      subtype: 'shot',
      model: MODEL,
      prompt: '走廊全景',
      params: { aspectRatio: '3:4' },
    })
    const plan = planV4Generation('still', {
      nodes: [...graph.nodes, still],
      edges: [
        edge('a', 'char', 'still', NODE_SLOT_IDS.reference),
        edge('b', 't1', 'still', NODE_SLOT_IDS.text),
      ],
    })!
    expect(plan.kind).toBe('image')
    expect(plan.referenceImages).toEqual(['https://cdn/char.png'])
    expect(plan.prompt).toBe('她回头\n\n走廊全景')
    expect(plan.aspectRatio).toBe('3:4')
  })

  it('音：台词经 text 槽进 prompt', () => {
    const out = node('out', { kind: 'audio', subtype: 'voice', model: MODEL })
    const plan = planV4Generation('out', {
      nodes: [out, script],
      edges: [edge('a', 't1', 'out', NODE_SLOT_IDS.text)],
    })!
    expect(plan.kind).toBe('audio')
    expect(plan.prompt).toBe('她回头')
  })

  it('合并节点少于 2 条片段 → 计划里带 belowMin，调用方必须先看它', () => {
    const clip = node('c1', {
      kind: 'video',
      subtype: 'clip',
      url: 'https://cdn/c1.mp4',
    })
    const merge = node('m', { kind: 'video', subtype: 'merge', model: MODEL })
    const plan = planV4Generation('m', {
      nodes: [clip, merge],
      edges: [edge('a', 'c1', 'm', NODE_SLOT_IDS.clip)],
    })!
    expect(plan.issues).toEqual([
      {
        slot: NODE_SLOT_IDS.clip,
        issue: V4_SLOT_ISSUE_IDS.belowMin,
        i18nKey: 'StudioNode.v4.slotIssue.belowMin',
      },
    ])
  })
})
