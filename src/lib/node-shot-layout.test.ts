import { describe, expect, it } from 'vitest'

import { NODE_V4_LAYOUT } from '@/constants/node-studio'
import {
  buildShotLanes,
  listShotNos,
  looseAreaSpawn,
  moveNodeToShot,
  nextShotNo,
  orderSourcesBySlot,
  reorderShots,
  tidyShotLanes,
} from '@/lib/node-shot-layout'
import { reconcileStateSlots } from '@/lib/node-slot-binding'
import type { NodeV4, NodeWorkflowStateV4 } from '@/types/node-workflow'

const NOW = '2026-09-07T00:00:00.000Z'

function node(
  id: string,
  kind: 'text' | 'image' | 'audio' | 'video',
  subtype: string,
  shotNo: number | undefined,
  name: string,
): NodeV4 {
  const base = {
    name,
    status: 'idle' as const,
    createdAt: NOW,
    ...(shotNo ? { shotNo } : {}),
  }
  const data =
    kind === 'text'
      ? { ...base, kind, subtype: subtype as 'shotNote', body: 'x' }
      : kind === 'audio'
        ? { ...base, kind, subtype: subtype as 'voice' }
        : kind === 'image'
          ? { ...base, kind, subtype: subtype as 'shot' }
          : { ...base, kind, subtype: subtype as 'shot' }
  return { id, position: { x: 999, y: 999 }, data: data as NodeV4['data'] }
}

function scene(): NodeWorkflowStateV4 {
  const state: NodeWorkflowStateV4 = {
    version: 4,
    nodes: [
      node('t2', 'text', 'shotNote', 2, 'S02·分镜'),
      node('i_kf2', 'image', 'shot', 2, 'S02·首帧'),
      node('a_v2', 'audio', 'voice', 2, 'S02·语音'),
      node('v2', 'video', 'shot', 2, 'S02·镜头'),
      node('v3', 'video', 'shot', 3, 'S03·镜头'),
      node('i_ref', 'image', 'reference', undefined, '参考图1'),
    ],
    edges: [
      {
        id: 'e1',
        source: 'i_kf2',
        sourceHandle: 'out',
        target: 'v2',
        slot: 'firstFrame',
      },
      {
        id: 'e2',
        source: 'a_v2',
        sourceHandle: 'out',
        target: 'v2',
        slot: 'voice',
      },
      {
        id: 'e3',
        source: 't2',
        sourceHandle: 'out',
        target: 'v2',
        slot: 'text',
      },
    ],
  }
  return reconcileStateSlots(state, { now: NOW })
}

describe('buildShotLanes', () => {
  it('按镜号横排成时间轴，带间距 80', () => {
    const lanes = buildShotLanes(scene().nodes, scene().edges)
    expect(lanes.map((lane) => lane.shotNo)).toEqual([2, 3])
    expect(lanes[0]?.x).toBe(NODE_V4_LAYOUT.originX)
    expect(lanes[1]?.x).toBe(
      (lanes[0]?.x ?? 0) + (lanes[0]?.width ?? 0) + NODE_V4_LAYOUT.laneGap,
    )
    expect(lanes[0]?.shotNodeId).toBe('v2')
  })

  it('散节点不进任何镜头带', () => {
    const lanes = buildShotLanes(scene().nodes, scene().edges)
    expect(lanes.flatMap((lane) => lane.nodeIds)).not.toContain('i_ref')
  })
})

describe('orderSourcesBySlot', () => {
  it('左边那一摞的顺序 = 端口表的槽顺序（首帧 → 尾帧 → 参考 → 语音 → 文本）', () => {
    const state = scene()
    const shot = state.nodes.find((item) => item.id === 'v2')!
    expect(orderSourcesBySlot(shot, state.edges)).toEqual([
      'i_kf2',
      'a_v2',
      't2',
    ])
  })
})

describe('tidyShotLanes', () => {
  it('只动位置，不动 shotNo / 边 / 名字', () => {
    const before = scene()
    const after = tidyShotLanes(before)
    expect(after.edges).toEqual(before.edges)
    expect(
      after.nodes.map((item) => [item.id, item.data.name, item.data.shotNo]),
    ).toEqual(
      before.nodes.map((item) => [item.id, item.data.name, item.data.shotNo]),
    )
    expect(after.nodes.find((item) => item.id === 'v2')?.position).not.toEqual({
      x: 999,
      y: 999,
    })
  })

  it('散节点的自由位置不被整理', () => {
    const after = tidyShotLanes(scene())
    expect(after.nodes.find((item) => item.id === 'i_ref')?.position).toEqual({
      x: 999,
      y: 999,
    })
  })
})

describe('reorderShots', () => {
  it('换序后镜号与名字里的 S<nn> 段一起重排，自定义后半段保留', () => {
    const state = scene()
    state.nodes.push(node('x', 'image', 'shot', 2, 'S02·西格莉卡近景'))
    const after = reorderShots(state, 2, 3)
    const moved = after.nodes.find((item) => item.id === 'x')
    expect(moved?.data.shotNo).toBe(3)
    expect(moved?.data.name).toBe('S03·西格莉卡近景')
    expect(after.nodes.find((item) => item.id === 'v3')?.data.name).toBe(
      'S02·镜头',
    )
  })

  it('from === to 是空操作', () => {
    const state = scene()
    expect(reorderShots(state, 2, 2)).toBe(state)
  })
})

describe('moveNodeToShot', () => {
  it('移出镜头带把前缀整段剥掉', () => {
    const after = moveNodeToShot(scene(), 'i_kf2', null)
    const moved = after.nodes.find((item) => item.id === 'i_kf2')
    expect(moved?.data.shotNo).toBeUndefined()
    expect(moved?.data.name).toBe('首帧')
  })

  it('归镜时加上前缀', () => {
    const after = moveNodeToShot(scene(), 'i_ref', 5)
    const moved = after.nodes.find((item) => item.id === 'i_ref')
    expect(moved?.data.shotNo).toBe(5)
    expect(moved?.data.name).toBe('S05·参考图1')
  })
})

describe('镜号分配', () => {
  it('新建镜头插末尾', () => {
    expect(listShotNos(scene().nodes)).toEqual([2, 3])
    expect(nextShotNo(scene().nodes)).toBe(4)
    expect(nextShotNo([])).toBe(1)
  })

  it('散节点区在时间轴下方且按列铺开', () => {
    expect(looseAreaSpawn(0).y).toBe(NODE_V4_LAYOUT.looseAreaY)
    expect(looseAreaSpawn(NODE_V4_LAYOUT.looseColumns).y).toBe(
      NODE_V4_LAYOUT.looseAreaY + NODE_V4_LAYOUT.looseRowGap,
    )
  })
})
