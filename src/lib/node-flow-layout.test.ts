import { describe, expect, it } from 'vitest'

import { NODE_V4_LAYOUT } from '@/constants/node-studio'
import type {
  NodeV4,
  NodeWorkflowEdgeV4,
  NodeWorkflowStateV4,
} from '@/types/node-workflow'

import { placeRowBeside, tidyByFlow } from './node-flow-layout'

const NOW = '2026-09-29T00:00:00.000Z'
const SIZE = { width: 300, height: 200 }
const sizeOf = () => SIZE

function node(
  id: string,
  kind: 'text' | 'image' | 'audio' | 'video',
  subtype: string,
  position: { x: number; y: number },
): NodeV4 {
  return {
    id,
    position,
    data: { kind, subtype, name: id, status: 'idle', createdAt: NOW },
  } as unknown as NodeV4
}

function edge(source: string, target: string, slot = 'reference') {
  return {
    id: `${source}->${target}`,
    source,
    sourceHandle: 'out',
    target,
    slot,
  } as unknown as NodeWorkflowEdgeV4
}

function state(
  nodes: readonly NodeV4[],
  edges: readonly NodeWorkflowEdgeV4[] = [],
): NodeWorkflowStateV4 {
  return { version: 4, nodes, edges } as unknown as NodeWorkflowStateV4
}

const at = (next: NodeWorkflowStateV4, id: string) =>
  next.nodes.find((item) => item.id === id)!.position

const COLUMN = SIZE.width + NODE_V4_LAYOUT.flowColumnGap
const ROW = SIZE.height + NODE_V4_LAYOUT.flowRowGap

describe('tidyByFlow（§7 摆放 A）', () => {
  it('素材 → 镜头 → 成片 三列，素材对齐它的下游', () => {
    const next = tidyByFlow(
      state(
        [
          node('shot', 'video', 'shot', { x: 40, y: 900 }),
          node('frame', 'image', 'shot', { x: 900, y: 10 }),
          node('her', 'image', 'character', { x: 500, y: 500 }),
        ],
        [edge('her', 'frame'), edge('frame', 'shot', 'firstFrame')],
      ),
      sizeOf,
    )
    // 原点 = 原来最左上角（x 40 · y 10）。
    expect(at(next, 'her')).toEqual({ x: 40, y: 10 })
    expect(at(next, 'frame')).toEqual({ x: 40 + COLUMN, y: 10 })
    expect(at(next, 'shot')).toEqual({ x: 40 + COLUMN * 2, y: 10 })
  })

  it('没连线的卡按档位站列：文字在素材列、视频镜头在成片列', () => {
    const next = tidyByFlow(
      state([
        node('clip', 'video', 'shot', { x: 0, y: 0 }),
        node('note', 'text', 'script', { x: 800, y: 0 }),
      ]),
      sizeOf,
    )
    // 中间那列空着就收掉 —— 两张卡紧挨着两列。
    expect(at(next, 'note')).toEqual({ x: 0, y: 0 })
    expect(at(next, 'clip')).toEqual({ x: COLUMN, y: 0 })
  })

  it('图连到图也往右推一列；几张素材从下游的顶边开始往下叠', () => {
    const next = tidyByFlow(
      state(
        [
          node('a', 'image', 'result', { x: 0, y: 300 }),
          node('b', 'image', 'result', { x: 0, y: 0 }),
          node('target', 'image', 'shot', { x: 0, y: 600 }),
        ],
        [edge('a', 'target'), edge('b', 'target')],
      ),
      sizeOf,
    )
    expect(at(next, 'target')).toEqual({ x: COLUMN, y: 0 })
    // 同一个下游：按原来的上下次序叠（b 原来在上面）。
    expect(at(next, 'b')).toEqual({ x: 0, y: 0 })
    expect(at(next, 'a')).toEqual({ x: 0, y: ROW })
  })

  it('已经整齐：原样返回同一份 state（⛔ 不多记一条撤销）', () => {
    const before = state(
      [
        node('her', 'image', 'character', { x: 0, y: 0 }),
        node('frame', 'image', 'shot', { x: COLUMN, y: 0 }),
      ],
      [edge('her', 'frame')],
    )
    expect(tidyByFlow(before, sizeOf)).toBe(before)
  })

  it('只动位置：边与数据一个字不改；成环也不死循环', () => {
    const edges = [edge('a', 'b'), edge('b', 'a')]
    const before = state(
      [
        node('a', 'image', 'shot', { x: 0, y: 500 }),
        node('b', 'image', 'shot', { x: 700, y: 0 }),
      ],
      edges,
    )
    const next = tidyByFlow(before, sizeOf)
    expect(next.edges).toBe(edges)
    expect(next.nodes.map((item) => item.data)).toEqual(
      before.nodes.map((item) => item.data),
    )
  })
})

describe('placeRowBeside（§7 摆放 A「让位」）', () => {
  const anchor = { x: 0, y: 0, width: 300, height: 200 }
  const card = { width: 300, height: 200 }

  it('右边空着就落在右边，与来源顶边齐', () => {
    expect(placeRowBeside([], anchor, [card], 40)).toEqual([{ x: 340, y: 0 }])
  })

  it('右边被占就往下，越过挡路的那几张', () => {
    const occupied = [
      { x: 340, y: 0, width: 300, height: 200 },
      { x: 360, y: 250, width: 300, height: 100 },
    ]
    expect(placeRowBeside(occupied, anchor, [card], 40)).toEqual([
      { x: 340, y: 390 },
    ])
  })

  it('一行几张一起找空位：整行要放得下', () => {
    const occupied = [{ x: 700, y: 0, width: 300, height: 200 }]
    expect(placeRowBeside(occupied, anchor, [card, card], 40)).toEqual([
      { x: 340, y: 240 },
      { x: 680, y: 240 },
    ])
  })

  it('左边：整行的右边缘贴着来源左边留出间距', () => {
    expect(placeRowBeside([], anchor, [card], 40, 'left')).toEqual([
      { x: -340, y: 0 },
    ])
  })
})
