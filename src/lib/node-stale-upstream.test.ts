import { describe, expect, it } from 'vitest'

import { NODE_SLOT_IDS, NODE_SLOT_OUTPUT_IDS } from '@/constants/node-slots'
import type {
  NodeV4,
  NodeV4Data,
  NodeWorkflowEdgeV4,
} from '@/types/node-workflow'

import {
  listStaleNodeIds,
  readUpstreamFingerprint,
} from './node-stale-upstream'

const T0 = '2026-11-18T00:00:00.000Z'
const T1 = '2026-11-18T01:00:00.000Z'
const T2 = '2026-11-18T02:00:00.000Z'

function node(
  id: string,
  data: Partial<NodeV4Data> & { kind: NodeV4Data['kind'] },
): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: { name: id, status: 'idle', createdAt: T0, ...data } as NodeV4Data,
  }
}

function version(url: string, createdAt: string, generated = true) {
  return {
    id: `v-${url}`,
    url,
    createdAt,
    ...(generated ? { generationId: `g-${url}` } : {}),
  }
}

const wire = (
  id: string,
  source: string,
  target: string,
  slot: NodeWorkflowEdgeV4['slot'],
): NodeWorkflowEdgeV4 => ({
  id,
  source,
  sourceHandle: NODE_SLOT_OUTPUT_IDS.out,
  target,
  slot,
})

const shotAt = (at: string) =>
  node('shot', {
    kind: 'video',
    subtype: 'shot',
    label: 'S1',
    url: 'shot.mp4',
    outputs: { versions: [version('shot.mp4', at)], cur: 0 },
  })

describe('listStaleNodeIds（「已变」，派生不落库）', () => {
  const edges = [wire('e1', 'img', 'shot', NODE_SLOT_IDS.firstFrame)]

  it('上游出了新一版、晚于本卡上次生成 → 已变', () => {
    const img = node('img', {
      kind: 'image',
      subtype: 'shot',
      url: 'b.png',
      outputs: {
        versions: [version('a.png', T0), version('b.png', T2)],
        cur: 1,
      },
    })
    expect(listStaleNodeIds([img, shotAt(T1)], edges, new Map())).toEqual([
      'shot',
    ])
  })

  it('本卡重新生成后（时间晚于上游那一版）→ 清掉', () => {
    const img = node('img', {
      kind: 'image',
      subtype: 'shot',
      url: 'b.png',
      outputs: { versions: [version('b.png', T1)], cur: 0 },
    })
    expect(listStaleNodeIds([img, shotAt(T2)], edges, new Map())).toEqual([])
  })

  it('会话快照：上游文本改过 → 已变；改回去 → 不再已变', () => {
    const text = node('t', { kind: 'text', subtype: 'script', body: '她回头' })
    const shot = shotAt(T1)
    const textEdges = [wire('e1', 't', 'shot', NODE_SLOT_IDS.text)]
    const snapshot = readUpstreamFingerprint('shot', textEdges, [text, shot])
    const snapshots = new Map([['shot', snapshot]])
    expect(listStaleNodeIds([text, shot], textEdges, snapshots)).toEqual([])
    const edited = node('t', {
      kind: 'text',
      subtype: 'script',
      body: '她转身',
    })
    expect(listStaleNodeIds([edited, shot], textEdges, snapshots)).toEqual([
      'shot',
    ])
  })

  it('备注改了不算（它本来就不发送）', () => {
    const note = node('n', { kind: 'text', subtype: 'shotNote', body: 'a' })
    const shot = shotAt(T1)
    const noteEdges = [wire('e1', 'n', 'shot', NODE_SLOT_IDS.text)]
    const snapshots = new Map([
      ['shot', readUpstreamFingerprint('shot', noteEdges, [note, shot])],
    ])
    const edited = node('n', { kind: 'text', subtype: 'shotNote', body: 'b' })
    expect(listStaleNodeIds([edited, shot], noteEdges, snapshots)).toEqual([])
  })

  it('本卡从没生成过（只有上传的版本）→ 不标', () => {
    const img = node('img', {
      kind: 'image',
      subtype: 'shot',
      url: 'b.png',
      outputs: { versions: [version('b.png', T2)], cur: 0 },
    })
    const uploaded = node('shot', {
      kind: 'video',
      subtype: 'shot',
      label: 'S1',
      url: 'up.mp4',
      outputs: { versions: [version('up.mp4', T1, false)], cur: 0 },
    })
    expect(listStaleNodeIds([img, uploaded], edges, new Map())).toEqual([])
  })
})
