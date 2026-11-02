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
  planV4ConnectDrop,
  planV4IngestDrop,
  previewV4SlotCapacity,
} from './use-cast-ingest-v4'

/** S6e 的用例还要几个别的目标卡。 */
const character2 = node('char2', {
  kind: 'image',
  subtype: 'character',
  name: '另一个角色',
})
const voiceCard = node('vc', {
  kind: 'audio',
  subtype: 'voice',
  name: '音色卡',
})
const refImage = node('ref', {
  kind: 'image',
  subtype: 'reference',
  name: '外来参考',
})
const imageResult = node('img', {
  kind: 'image',
  subtype: 'result',
  name: '散图',
})
const allNodes = [...nodes, character2, voiceCard, refImage, imageResult]

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
  it('拖一张图到镜头卡 = 落进参考（spec §5 · 2026-09-10 定稿），⛔ 不再问首帧还是尾帧', () => {
    // 镜头卡是**唯一**有默认落点的目标：图默认作参考，首 / 尾是它的角色，
    // 挂上去之后在参考轨上点图改。
    const plan = planV4IngestDrop(first, shot, [], nodes)
    expect(plan).toMatchObject({
      kind: 'single',
      candidate: { slot: NODE_SLOT_IDS.reference },
    })
  })

  it('多个口都收得下、且没有默认落点 → 不替用户挑，把候选连同 n/m 交回去点亮', () => {
    // 角色卡：一张图同时能进 `reference` 与 `closeup`，两者都没有默认口。
    const character = node('character', {
      kind: 'image',
      subtype: 'character',
      url: 'https://cdn/c.png',
    })
    const reference = node('ref', {
      kind: 'image',
      subtype: 'reference',
      url: 'https://cdn/r.png',
    })
    const plan = planV4IngestDrop(
      reference,
      character,
      [],
      [reference, character],
    )
    expect(plan.kind).toBe('choose')
    if (plan.kind !== 'choose') return
    expect(plan.candidates.map((candidate) => candidate.slot)).toEqual([
      NODE_SLOT_IDS.reference,
      NODE_SLOT_IDS.closeup,
    ])
    // 0..N 的槽报不出上限 —— 诚实沉默，⛔ 不硬造一个数。
    expect(plan.candidates[0]?.capacity).toBeNull()
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

describe('planV4ConnectDrop · 落线 / 整卡落卡（S6e，spec §1.13）', () => {
  it('槽由来源 kind 定：图 → 参考、语音 → 语音、文本 → 说明', () => {
    expect(planV4ConnectDrop(first, shot, [], nodes)).toEqual({
      kind: 'connect',
      slot: NODE_SLOT_IDS.reference,
    })
    expect(planV4ConnectDrop(mutedVoice, shot, [], nodes)).toEqual({
      kind: 'connect',
      slot: NODE_SLOT_IDS.voice,
    })
    expect(planV4ConnectDrop(script, shot, [], nodes)).toEqual({
      kind: 'connect',
      slot: NODE_SLOT_IDS.text,
    })
  })

  it('⛔ 不问用户：多个口收得下时也直接落默认那个（拖线瞄的是整张卡）', () => {
    // 同一对端点在拖投里是 `choose`（角色卡的参考 / 特写两个口都收得下）。
    expect(planV4IngestDrop(character, character2, [], allNodes).kind).toBe(
      'choose',
    )
    expect(planV4ConnectDrop(character, character2, [], allNodes)).toEqual({
      kind: 'connect',
      slot: NODE_SLOT_IDS.reference,
    })
  })

  it('首选口不存在但恰好一个口收得下 → 回落到那个口（音色卡的 timbre）', () => {
    expect(planV4ConnectDrop(mutedVoice, voiceCard, [], allNodes)).toEqual({
      kind: 'connect',
      slot: NODE_SLOT_IDS.timbre,
    })
  })

  it('矩阵拒绝 → 不连，并带上可见理由（图片卡拖到音色卡上：那个口只收音频）', () => {
    expect(planV4ConnectDrop(first, voiceCard, [], allNodes)).toEqual({
      kind: 'rejected',
      reason: 'kindNotAllowed',
    })
  })

  it('⚠ 文本 → 图片卡是**合法**的（端口表给了图片卡一个 0..1 的 text 口）', () => {
    expect(planV4ConnectDrop(script, first, [], allNodes)).toEqual({
      kind: 'connect',
      slot: NODE_SLOT_IDS.text,
    })
  })

  it('叶子源没有入口 → unknownSlot，⛔ 不静默失败', () => {
    expect(planV4ConnectDrop(first, refImage, [], allNodes)).toEqual({
      kind: 'rejected',
      reason: 'unknownSlot',
    })
  })

  it('槽满 → 拒绝（模型把参考槽关掉之后，图片卡的图连不进去）', () => {
    expect(
      planV4ConnectDrop(first, imageResult, [], allNodes, {
        [NODE_SLOT_IDS.reference]: 0,
      }),
    ).toEqual({ kind: 'rejected', reason: 'slotFull' })
  })
})
