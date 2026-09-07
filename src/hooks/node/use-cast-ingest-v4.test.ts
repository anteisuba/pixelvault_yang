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

import {
  evaluateV4Ingest,
  planV4IngestDrop,
  previewV4SlotCapacity,
} from './use-cast-ingest-v4'

describe('evaluateV4Ingest · 能不能吃 → 吃进哪个口', () => {
  it('一张图拖到镜头上：首帧 / 尾帧 / 参考三个口都亮', () => {
    const result = evaluateV4Ingest(first, shot, [], nodes)
    expect(result.legal).toBe(true)
    expect(result.slots).toEqual([
      NODE_SLOT_IDS.firstFrame,
      NODE_SLOT_IDS.lastFrame,
      NODE_SLOT_IDS.reference,
    ])
  })

  it('已判失败的图不能进首帧，但仍可当参考 —— 语义门只关那一个口', () => {
    const blocked = node('bad', {
      kind: 'image',
      subtype: 'shot',
      url: 'https://cdn/bad.png',
      blocked: true,
    })
    const result = evaluateV4Ingest(blocked, shot, [], [...nodes, blocked])
    expect(result.slots).toEqual([NODE_SLOT_IDS.reference])
  })

  it('一个口都不亮时给得出理由（⛔ 不静默变灰）', () => {
    // 镜头 → 参考图（叶子源，一个入口都没有）。
    const leaf = node('leaf', { kind: 'image', subtype: 'reference' })
    const result = evaluateV4Ingest(shot, leaf, [], [shot, leaf])
    expect(result.legal).toBe(false)
    expect(result.slots).toEqual([])
    // 叶子源没有任何入口 → 连「第一个口」都没有，理由留空由调用方兜底文案。
    expect(result.reason).toBeUndefined()
  })

  it('已占的首帧槽仍然亮着 —— 轮播槽再连一条 = 加一个新版本，不是超限', () => {
    const second = node('second', {
      kind: 'image',
      subtype: 'shot',
      url: 'https://cdn/second.png',
    })
    const occupied = [edge('x', 'first', 'shot', NODE_SLOT_IDS.firstFrame)]
    const result = evaluateV4Ingest(second, shot, occupied, [...nodes, second])
    expect(result.slots).toContain(NODE_SLOT_IDS.firstFrame)
    expect(result.slots).toContain(NODE_SLOT_IDS.reference)
  })

  it('模型给的动态上限能把 0..N 的槽关掉', () => {
    const result = evaluateV4Ingest(first, shot, edges, nodes, {
      [NODE_SLOT_IDS.reference]: 1,
    })
    // 参考槽已有一条（角色卡），容量 1 → 满。
    expect(result.slots).not.toContain(NODE_SLOT_IDS.reference)
  })
})

describe('previewV4SlotCapacity · 张口预览的 n/m', () => {
  it('静态上限来自端口表，动态上限由调用方覆盖', () => {
    expect(
      previewV4SlotCapacity(shot, NODE_SLOT_IDS.firstFrame, edges),
    ).toEqual({ current: 1, limit: 1 })
    // 0..N 的槽没有静态上限 → 不给动态上限时报不出 n/m。
    expect(
      previewV4SlotCapacity(shot, NODE_SLOT_IDS.reference, edges),
    ).toBeNull()
    expect(
      previewV4SlotCapacity(shot, NODE_SLOT_IDS.reference, edges, {
        [NODE_SLOT_IDS.reference]: 9,
      }),
    ).toEqual({ current: 1, limit: 9 })
  })

  it('目标没有这个槽 → null', () => {
    expect(previewV4SlotCapacity(shot, NODE_SLOT_IDS.closeup, edges)).toBeNull()
  })
})

describe('planV4IngestDrop · 这一投落哪个槽', () => {
  it('多个口都收得下 → 不替用户挑，把候选连同 n/m 交回去点亮', () => {
    const plan = planV4IngestDrop(first, shot, [], nodes)
    expect(plan.kind).toBe('choose')
    if (plan.kind !== 'choose') return
    expect(plan.candidates.map((candidate) => candidate.slot)).toEqual([
      NODE_SLOT_IDS.firstFrame,
      NODE_SLOT_IDS.lastFrame,
      NODE_SLOT_IDS.reference,
    ])
    expect(plan.candidates[0]?.capacity).toEqual({ current: 0, limit: 1 })
    // 0..N 的槽报不出上限 —— 诚实沉默，⛔ 不硬造一个数。
    expect(plan.candidates[2]?.capacity).toBeNull()
  })

  it('只剩一个口收得下 → 直接给落点，不必问', () => {
    const plan = planV4IngestDrop(script, shot, [], nodes)
    expect(plan).toMatchObject({
      kind: 'single',
      candidate: { slot: NODE_SLOT_IDS.text },
    })
  })

  it('一个口都不亮 → rejected，并带上可见的理由', () => {
    const leaf = node('leaf', {
      kind: 'image',
      subtype: 'reference',
      url: 'https://cdn/leaf.png',
    })
    const plan = planV4IngestDrop(shot, leaf, [], [shot, leaf])
    expect(plan.kind).toBe('rejected')
  })

  it('点亮与落点是同一次判定 —— 动态上限关掉参考槽后候选里就没有它', () => {
    const plan = planV4IngestDrop(first, shot, edges, nodes, {
      [NODE_SLOT_IDS.reference]: 1,
    })
    if (plan.kind === 'rejected') throw new Error('should be connectable')
    const slots =
      plan.kind === 'single'
        ? [plan.candidate.slot]
        : plan.candidates.map((candidate) => candidate.slot)
    expect(slots).not.toContain(NODE_SLOT_IDS.reference)
  })
})
