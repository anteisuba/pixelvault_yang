import { describe, expect, it } from 'vitest'

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { NODE_SLOT_IDS, NODE_SLOT_OUTPUT_IDS } from '@/constants/node-slots'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
} from '@/constants/node-types'
import type {
  NodeV4,
  NodeV4Data,
  NodeWorkflowEdgeV4,
} from '@/types/node-workflow'

import {
  buildConnectToShotOps,
  buildConnectToShotTargets,
} from './connect-to-shot-targets'

const NOW = '2026-09-10T00:00:00.000Z'

function node(
  id: string,
  data: Partial<NodeV4Data> & { kind: NodeV4Data['kind'] },
  position = { x: 0, y: 0 },
): NodeV4 {
  return {
    id,
    position,
    data: { name: id, status: 'idle', createdAt: NOW, ...data } as NodeV4Data,
  }
}

function shot(
  id: string,
  extra: Record<string, unknown> = {},
  position = { x: 0, y: 0 },
): NodeV4 {
  return node(
    id,
    {
      kind: NODE_MEDIA_KIND_IDS.video,
      subtype: NODE_V4_VIDEO_SUBTYPE_IDS.shot,
      ...extra,
    } as Partial<NodeV4Data> & { kind: NodeV4Data['kind'] },
    position,
  )
}

function edge(
  id: string,
  source: string,
  target: string,
  slot: NodeWorkflowEdgeV4['slot'],
): NodeWorkflowEdgeV4 {
  return { id, source, sourceHandle: NODE_SLOT_OUTPUT_IDS.out, target, slot }
}

const formatDuration = (seconds: number) => `${Math.round(seconds)}s`

describe('buildConnectToShotTargets（spec §1.13 的列表来源）', () => {
  it('只列视频镜头卡，按镜头带顺序：有镜头号的先按号，其余按位置排在后面', () => {
    const targets = buildConnectToShotTargets({
      nodes: [
        shot('c', {}, { x: 10, y: 400 }),
        shot('b', { shotNo: 2 }),
        node('img', { kind: NODE_MEDIA_KIND_IDS.image }),
        shot('a', { shotNo: 1 }),
        shot('d', {}, { x: 10, y: 100 }),
      ],
      edges: [],
      formatDuration,
    })
    expect(targets.map((item) => item.id)).toEqual(['a', 'b', 'd', 'c'])
  })

  it('时长读数：落库的秒优先，其次模型参数；都没有就不写读数（⛔ 不编 0s）', () => {
    const targets = buildConnectToShotTargets({
      nodes: [
        shot('a', { shotNo: 1, durationSec: 7 }),
        shot('b', { shotNo: 2, params: { duration: 5 } }),
        shot('c', { shotNo: 3 }),
      ],
      edges: [],
      formatDuration,
    })
    expect(targets.map((item) => item.durationLabel)).toEqual([
      '7s',
      '5s',
      undefined,
    ])
  })

  it('缩略退到首帧那张图；⛔ 不拿成片 url 当缩略', () => {
    const targets = buildConnectToShotTargets({
      nodes: [
        shot('a', { shotNo: 1, url: 'https://cdn.test/a.mp4' }),
        node('img', {
          kind: NODE_MEDIA_KIND_IDS.image,
          url: 'https://cdn.test/first.png',
        }),
      ],
      edges: [edge('e1', 'img', 'a', NODE_SLOT_IDS.firstFrame)],
      formatDuration,
    })
    expect(targets[0]!.thumbnailUrl).toBe('https://cdn.test/first.png')
  })

  it('已占的槽被报上来（弹层据此写「替换」）', () => {
    const targets = buildConnectToShotTargets({
      nodes: [shot('a', { shotNo: 1 })],
      edges: [
        edge('e1', 'x', 'a', NODE_SLOT_IDS.voice),
        edge('e2', 'y', 'a', NODE_SLOT_IDS.voice),
      ],
      formatDuration,
    })
    expect(targets[0]!.occupiedSlots).toEqual([NODE_SLOT_IDS.voice])
  })
})

describe('buildConnectToShotOps（替换 = 先断旧边）', () => {
  it('目标槽空着就只连一条', () => {
    expect(
      buildConnectToShotOps({
        sourceId: 'a1',
        targetId: 's1',
        slot: NODE_SLOT_IDS.voice,
        edges: [],
      }),
    ).toEqual([
      {
        op: NODE_ASSISTANT_OP_V4_IDS.connect,
        source: 'a1',
        target: 's1',
        slot: NODE_SLOT_IDS.voice,
      },
    ])
  })

  it('目标槽已有内容：同一批里先断旧边再连（⛔ 不静默叠一条）', () => {
    const ops = buildConnectToShotOps({
      sourceId: 'a2',
      targetId: 's1',
      slot: NODE_SLOT_IDS.voice,
      edges: [
        edge('old', 'a1', 's1', NODE_SLOT_IDS.voice),
        // 别的槽 / 别的卡上的边不能被牵连。
        edge('keep-slot', 'i1', 's1', NODE_SLOT_IDS.firstFrame),
        edge('keep-node', 'a1', 's2', NODE_SLOT_IDS.voice),
      ],
    })
    expect(ops).toEqual([
      { op: NODE_ASSISTANT_OP_V4_IDS.disconnect, edgeId: 'old' },
      {
        op: NODE_ASSISTANT_OP_V4_IDS.connect,
        source: 'a2',
        target: 's1',
        slot: NODE_SLOT_IDS.voice,
      },
    ])
  })
})
