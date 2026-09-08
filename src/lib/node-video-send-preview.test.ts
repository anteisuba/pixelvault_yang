import { describe, expect, it } from 'vitest'

import { NODE_SLOT_IDS, NODE_SLOT_OUTPUT_IDS } from '@/constants/node-slots'
import type {
  NodeV4,
  NodeV4Data,
  NodeWorkflowEdgeV4,
} from '@/types/node-workflow'

const V4_NOW = '2026-09-08T00:00:00.000Z'

import { buildVideoSendPreviewV4 } from './node-video-send-preview'

const AUTO_NAME_PREFIX = {
  character: '角色',
  background: '场景',
  shot: '镜头',
  closeup: '特写',
  video: '视频',
}

function v4Node(
  id: string,
  data: Partial<NodeV4Data> & { kind: NodeV4Data['kind'] },
): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      name: id,
      status: 'idle',
      createdAt: V4_NOW,
      ...data,
    } as NodeV4Data,
  }
}

function v4Edge(
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

describe('buildVideoSendPreviewV4', () => {
  const nodes: NodeV4[] = [
    v4Node('first', {
      kind: 'image',
      subtype: 'shot',
      name: '开场',
      url: 'https://cdn/first.png',
    }),
    v4Node('last', {
      kind: 'image',
      subtype: 'shot',
      name: '收尾',
      url: 'https://cdn/last.png',
    }),
    v4Node('char', {
      kind: 'image',
      subtype: 'character',
      name: '阿岚',
      url: 'https://cdn/char.png',
    }),
    v4Node('cu', {
      kind: 'image',
      subtype: 'reference',
      name: '阿岚脸部',
      url: 'https://cdn/cu.png',
    }),
    v4Node('shot', {
      kind: 'video',
      subtype: 'shot',
      name: '走廊',
      prompt: '@阿岚 走进走廊',
    }),
  ]
  const edges: NodeWorkflowEdgeV4[] = [
    v4Edge('e1', 'first', 'shot', NODE_SLOT_IDS.firstFrame),
    v4Edge('e2', 'last', 'shot', NODE_SLOT_IDS.lastFrame),
    v4Edge('e3', 'char', 'shot', NODE_SLOT_IDS.reference),
    v4Edge('e4', 'cu', 'char', NODE_SLOT_IDS.closeup),
  ]

  const preview = buildVideoSendPreviewV4({
    nodeId: 'shot',
    nodes,
    edges,
    maxReferenceImages: undefined,
    autoNamePrefix: AUTO_NAME_PREFIX,
  })

  it('关键帧按**槽**给首/尾帧分类，⛔ 不按序位猜，也不冒充 kind 的一档', () => {
    const first = preview.images.find(
      (image) => image.url === 'https://cdn/first.png',
    )
    const last = preview.images.find(
      (image) => image.url === 'https://cdn/last.png',
    )
    expect(first).toMatchObject({ name: '开场', category: '首帧' })
    expect(first?.kind).toBeUndefined()
    expect(last).toMatchObject({ name: '收尾', category: '尾帧' })
    expect(last?.kind).toBeUndefined()
  })

  it('参考槽的角色卡与一跳特写各归各档', () => {
    expect(
      preview.images.find((image) => image.url === 'https://cdn/char.png'),
    ).toMatchObject({ name: '阿岚', kind: 'character' })
    expect(
      preview.images.find((image) => image.url === 'https://cdn/cu.png'),
    ).toMatchObject({ name: '阿岚脸部', kind: 'closeup' })
  })

  it('图例把关键帧打印成「名字（分类）」，角色走 kind「名字」那一支', () => {
    expect(preview.legend).toContain('开场（首帧）')
    expect(preview.legend).toContain('收尾（尾帧）')
    expect(preview.legend).toContain('角色「阿岚」')
  })

  it('@name → @ImageN 用的是同一张表，关键帧不参与（它没有可插入的 token）', () => {
    const charIndex = preview.images.findIndex(
      (image) => image.url === 'https://cdn/char.png',
    )
    expect(preview.translatedPrompt).toContain(`@Image${charIndex + 1}`)
    expect(preview.translatedPrompt).not.toContain('@阿岚')
  })
})
