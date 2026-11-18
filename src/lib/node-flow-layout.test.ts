import { describe, expect, it } from 'vitest'

import { NODE_V4_CARD, NODE_V4_LAYOUT } from '@/constants/node-studio'
import type {
  NodeV4,
  NodeWorkflowEdgeV4,
  NodeWorkflowStateV4,
} from '@/types/node-workflow'

import {
  placeInArea,
  placeNearPoint,
  placeNewCards,
  placeRowBeside,
  tidyByFlow,
} from './node-flow-layout'

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

  it('没连线的卡按类型分区：文本 · 图片 · 视频 · 声音，每区横着铺', () => {
    const next = tidyByFlow(
      state([
        node('voice', 'audio', 'voice', { x: 0, y: 0 }),
        node('clip', 'video', 'shot', { x: 0, y: 100 }),
        node('img2', 'image', 'result', { x: 900, y: 50 }),
        node('img1', 'image', 'result', { x: 400, y: 50 }),
        node('note', 'text', 'script', { x: 800, y: 0 }),
      ]),
      sizeOf,
    )
    const ZONE = SIZE.height + NODE_V4_LAYOUT.tidyZoneGap
    expect(at(next, 'note')).toEqual({ x: 0, y: 0 })
    // 同一区按原来的先后横着排。
    expect(at(next, 'img1')).toEqual({ x: 0, y: ZONE })
    expect(at(next, 'img2')).toEqual({
      x: SIZE.width + NODE_V4_LAYOUT.flowRowGap,
      y: ZONE,
    })
    expect(at(next, 'clip')).toEqual({ x: 0, y: ZONE * 2 })
    expect(at(next, 'voice')).toEqual({ x: 0, y: ZONE * 3 })
  })

  it('素材区一行铺满就换行', () => {
    const many = Array.from({ length: 7 }, (_, index) =>
      node(`img${index}`, 'image', 'result', { x: index * 10, y: 0 }),
    )
    const next = tidyByFlow(state(many), sizeOf)
    const perRow = Math.floor(
      (NODE_V4_LAYOUT.tidyZoneRowWidth + NODE_V4_LAYOUT.flowRowGap) /
        (SIZE.width + NODE_V4_LAYOUT.flowRowGap),
    )
    expect(at(next, `img${perRow}`)).toEqual({ x: 0, y: ROW })
  })

  it('有连线的在上面一条链一行带，散卡在下面', () => {
    const next = tidyByFlow(
      state(
        [
          node('loose', 'image', 'result', { x: 0, y: 0 }),
          node('a1', 'image', 'character', { x: 0, y: 500 }),
          node('a2', 'video', 'shot', { x: 400, y: 500 }),
          node('b1', 'image', 'character', { x: 0, y: 900 }),
          node('b2', 'video', 'shot', { x: 400, y: 900 }),
        ],
        [edge('a1', 'a2', 'firstFrame'), edge('b1', 'b2', 'firstFrame')],
      ),
      sizeOf,
    )
    const BAND = SIZE.height + NODE_V4_LAYOUT.tidyZoneGap
    expect(at(next, 'a1')).toEqual({ x: 0, y: 0 })
    expect(at(next, 'a2').y).toBe(0)
    expect(at(next, 'b1')).toEqual({ x: 0, y: BAND })
    expect(at(next, 'b2').y).toBe(BAND)
    expect(at(next, 'loose')).toEqual({ x: 0, y: BAND * 2 })
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

  it('九宫格一组整块挪：组内 3×3 原样，⛔ 拆成一竖条', () => {
    const cells = Array.from({ length: 9 }, (_, index) => {
      const cell = node(`cell${index}`, 'image', 'shot', {
        x: 1000 + (index % 3) * 320,
        y: 800 + Math.floor(index / 3) * 220,
      })
      return {
        ...cell,
        data: { ...cell.data, storyboardCell: { groupId: 'g', cell: index } },
      } as NodeV4
    })
    const next = tidyByFlow(
      state([node('her', 'image', 'character', { x: 0, y: 0 }), ...cells]),
      sizeOf,
    )
    // 同在图片区：九宫格整块排在「her」右边。
    const origin = at(next, 'cell0')
    expect(origin).toEqual({
      x: SIZE.width + NODE_V4_LAYOUT.flowRowGap,
      y: 0,
    })
    cells.forEach((cell, index) => {
      expect(at(next, cell.id)).toEqual({
        x: origin.x + (index % 3) * 320,
        y: origin.y + Math.floor(index / 3) * 220,
      })
    })
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

describe('placeNewCards（助手新建的卡找空位）', () => {
  const overlaps = (next: NodeWorkflowStateV4, a: string, b: string) => {
    const p = at(next, a)
    const q = at(next, b)
    return (
      p.x < q.x + SIZE.width &&
      q.x < p.x + SIZE.width &&
      p.y < q.y + SIZE.height &&
      q.y < p.y + SIZE.height
    )
  }

  it('没连线的新卡不压在散卡区已有的卡上，几张排成一行', () => {
    const origin = { x: NODE_V4_LAYOUT.originX, y: NODE_V4_LAYOUT.looseAreaY }
    const next = placeNewCards(
      state([
        node('old', 'image', 'character', origin),
        node('a', 'image', 'character', origin),
        node('b', 'image', 'character', origin),
      ]),
      ['a', 'b'],
      sizeOf,
    )
    expect(overlaps(next, 'a', 'old')).toBe(false)
    expect(overlaps(next, 'b', 'old')).toBe(false)
    expect(at(next, 'a').y).toBe(at(next, 'b').y)
    expect(at(next, 'b').x).toBe(
      at(next, 'a').x + SIZE.width + NODE_V4_CARD.derivedGap,
    )
  })

  it('喂进已有卡的落在它左边，从已有卡接出来的落在右边', () => {
    const shot = node('shot', 'video', 'shot', { x: 2000, y: 2000 })
    const next = placeNewCards(
      state(
        [
          shot,
          node('ref', 'image', 'character', { x: 0, y: 0 }),
          node('out', 'image', 'shot', { x: 0, y: 0 }),
        ],
        [edge('ref', 'shot'), edge('shot', 'out')],
      ),
      ['ref', 'out'],
      sizeOf,
    )
    expect(at(next, 'ref').x).toBeLessThan(2000)
    expect(at(next, 'out').x).toBeGreaterThan(2000 + SIZE.width)
    expect(at(next, 'ref').y).toBe(2000)
  })

  it('紧挨着那一列一直往下都满了：去外面一列，⛔ 落到几千像素以下', () => {
    const wall: NodeV4[] = Array.from({ length: 20 }, (_, index) =>
      node(`wall${index}`, 'image', 'character', {
        x: SIZE.width + NODE_V4_CARD.derivedGap,
        y: index * (SIZE.height + 10),
      }),
    )
    const next = placeNewCards(
      state(
        [
          node('anchor', 'image', 'result', { x: 0, y: 0 }),
          ...wall,
          node('fresh', 'image', 'character', { x: 0, y: 0 }),
        ],
        [edge('anchor', 'fresh')],
      ),
      ['fresh'],
      sizeOf,
    )
    expect(at(next, 'fresh').y).toBe(0)
    expect(at(next, 'fresh').x).toBeGreaterThan(
      SIZE.width * 2 + NODE_V4_CARD.derivedGap,
    )
  })
})

describe('placeNearPoint（手动加卡：指的点空着就落那里，否则找最近空位）', () => {
  it('空画布：恰好落在指的点上', () => {
    expect(placeNearPoint([], { x: 100, y: 50 }, [SIZE])).toEqual([
      { x: 100, y: 50 },
    ])
  })

  it('同一个点连加两张：第二张让开，⛔ 两张叠成一张', () => {
    const [first] = placeNearPoint([], { x: 0, y: 0 }, [SIZE])
    const [second] = placeNearPoint([{ ...first!, ...SIZE }], { x: 0, y: 0 }, [
      SIZE,
    ])
    const gap = NODE_V4_CARD.derivedGap
    const overlaps =
      second!.x < first!.x + SIZE.width + gap &&
      first!.x < second!.x + SIZE.width + gap &&
      second!.y < first!.y + SIZE.height + gap &&
      first!.y < second!.y + SIZE.height + gap
    expect(overlaps).toBe(false)
  })
})

describe('placeInArea · 在可见区里找空位（owner 2026-11-18）', () => {
  const area = { left: 0, top: 0, right: 1200, bottom: 800 }
  const options = { padTop: 50, padBottom: 100, step: 20 }

  it('首选点空着 = 就落那里', () => {
    expect(placeInArea([], { x: 400, y: 200 }, SIZE, area, options)).toEqual({
      x: 400,
      y: 200,
    })
  })

  it('首选点压到卡 = 取可见区里最近的空位，卡连同上下留白都在区域里', () => {
    const occupied = [{ x: 350, y: 150, width: 400, height: 300 }]
    const at = placeInArea(occupied, { x: 400, y: 200 }, SIZE, area, options)
    expect(at).not.toBeNull()
    if (!at) return
    expect(at.x).toBeGreaterThanOrEqual(area.left)
    expect(at.x + SIZE.width).toBeLessThanOrEqual(area.right)
    expect(at.y - options.padTop).toBeGreaterThanOrEqual(area.top)
    expect(at.y + SIZE.height + options.padBottom).toBeLessThanOrEqual(
      area.bottom,
    )
    const gap = NODE_V4_CARD.derivedGap
    const hit =
      at.x < 350 + 400 + gap &&
      350 < at.x + SIZE.width + gap &&
      at.y < 150 + 300 + gap &&
      150 < at.y + SIZE.height + gap
    expect(hit).toBe(false)
  })

  it('不压被挡住的块（小地图）', () => {
    const avoid = [{ x: 900, y: 500, width: 300, height: 300 }]
    const at = placeInArea([], { x: 900, y: 500 }, SIZE, area, {
      ...options,
      avoid,
    })
    expect(at).not.toBeNull()
    if (!at) return
    const footprintBottom = at.y + SIZE.height + options.padBottom
    const inside =
      at.x < 1200 && at.x + SIZE.width > 900 && footprintBottom > 500
    expect(inside).toBe(false)
  })

  it('区域里放不下 = null（调用方往外放再挪镜头）', () => {
    expect(
      placeInArea([], { x: 0, y: 0 }, SIZE, { ...area, bottom: 300 }, options),
    ).toBeNull()
    const full = [{ x: -100, y: -100, width: 1400, height: 1000 }]
    expect(placeInArea(full, { x: 0, y: 0 }, SIZE, area, options)).toBeNull()
  })
})

describe('整理 · 叠在同一点的散卡（真机测试项目的形状，2026-11-18 核实）', () => {
  it('镜头图 / 语音 / 角色 / 背景叠在同一点、互不相连：整理后两两不重叠', () => {
    const at = { x: 500, y: 500 }
    const stacked: NodeV4[] = [
      { kind: 'image', subtype: 'shot' },
      { kind: 'audio', subtype: 'voice' },
      { kind: 'image', subtype: 'character' },
      { kind: 'image', subtype: 'background' },
      { kind: 'video', subtype: 'shot' },
    ].map((data, index) => ({
      id: `s${index}`,
      position: at,
      data: {
        ...data,
        name: `s${index}`,
        status: 'idle',
        createdAt: NOW,
      } as NodeV4['data'],
    }))
    const next = tidyByFlow({ version: 4, nodes: stacked, edges: [] }, sizeOf)
    const rects = next.nodes.map((node) => ({ ...node.position, ...SIZE }))
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        const a = rects[i]
        const b = rects[j]
        const overlap =
          a.x < b.x + b.width &&
          b.x < a.x + a.width &&
          a.y < b.y + b.height &&
          b.y < a.y + a.height
        expect(overlap).toBe(false)
      }
    }
  })
})
