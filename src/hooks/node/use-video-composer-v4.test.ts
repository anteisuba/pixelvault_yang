import { describe, expect, it } from 'vitest'

import { NODE_SLOT_IDS, NODE_SLOT_OUTPUT_IDS } from '@/constants/node-slots'
import type {
  NodeV4,
  NodeV4Data,
  NodeWorkflowEdgeV4,
} from '@/types/node-workflow'

const NOW = '2026-09-07T00:00:00.000Z'

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
  return { id, source, sourceHandle: NODE_SLOT_OUTPUT_IDS.out, target, slot }
}

const first = node('first', {
  kind: 'image',
  subtype: 'shot',
  name: '首帧图',
  url: 'https://cdn/first.png',
})
const character = node('char', {
  kind: 'image',
  subtype: 'character',
  name: '阿岚',
  url: 'https://cdn/char.png',
})
const mutedVoice = node('v0', { kind: 'audio', subtype: 'voice', name: '无音' })
const script = node('t1', {
  kind: 'text',
  subtype: 'shotNote',
  name: '第一镜文本',
  body: '她回头',
  defaultRole: 'script',
})
const shot = node('shot', {
  kind: 'video',
  subtype: 'shot',
  label: '走廊',
  name: 'S01·镜头',
})
const nodes = [first, character, mutedVoice, script, shot]
const edges = [
  edge('e1', 'first', 'shot', NODE_SLOT_IDS.firstFrame),
  edge('e2', 'char', 'shot', NODE_SLOT_IDS.reference),
  edge('e3', 'v0', 'shot', NODE_SLOT_IDS.voice),
  edge('e4', 't1', 'shot', NODE_SLOT_IDS.text),
]

import { buildV4ComposerTokens } from './use-video-composer-v4'

describe('buildV4ComposerTokens · 令牌由槽派生', () => {
  const tokens = buildV4ComposerTokens('shot', nodes, edges)

  it('顺序 = 端口表的入口顺序（首帧 → 尾帧 → 参考 → 语音 → 文本）', () => {
    expect(tokens.map((token) => token.slot)).toEqual([
      NODE_SLOT_IDS.firstFrame,
      NODE_SLOT_IDS.reference,
      NODE_SLOT_IDS.voice,
      NODE_SLOT_IDS.text,
    ])
  })

  it('序号是**槽内**序号，⛔ 不是全局载荷下标（不再 indexOf 反查）', () => {
    expect(tokens.map((token) => token.slotIndex)).toEqual([0, 0, 0, 0])
  })

  it('名字走稳定名，边 id 带着（× = 删这条线）', () => {
    expect(tokens.map((token) => token.label)).toEqual([
      '首帧图',
      '阿岚',
      '无音',
      '第一镜文本',
    ])
    expect(tokens.map((token) => token.edgeId)).toEqual([
      'e1',
      'e2',
      'e3',
      'e4',
    ])
  })

  it('挂着却发不出去的音色标成 sending: false，不静默消失', () => {
    const voiceToken = tokens.find(
      (token) => token.slot === NODE_SLOT_IDS.voice,
    )!
    expect(voiceToken.sending).toBe(false)
    // 文本没有 URL 也照样发得出去（它发的是字）。
    expect(
      tokens.find((token) => token.slot === NODE_SLOT_IDS.text)!.sending,
    ).toBe(true)
  })
})
