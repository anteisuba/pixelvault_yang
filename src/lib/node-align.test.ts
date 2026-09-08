import { describe, expect, it } from 'vitest'

import {
  NODE_ALIGN_EDGE_IDS,
  NODE_DISTRIBUTE_AXIS_IDS,
  alignNodes,
  distributeNodes,
  type AlignBox,
} from './node-align'

function box(
  id: string,
  x: number,
  y: number,
  width = 100,
  height = 50,
): AlignBox {
  return { id, x, y, width, height }
}

describe('alignNodes', () => {
  it('少于两张卡时什么都不动', () => {
    expect(alignNodes([box('a', 10, 10)], NODE_ALIGN_EDGE_IDS.left)).toEqual([])
  })

  it('左对齐到选区最小 x，已经在位的卡不产生 move', () => {
    expect(
      alignNodes(
        [box('a', 10, 0), box('b', 50, 20), box('c', 10, 40)],
        NODE_ALIGN_EDGE_IDS.left,
      ),
    ).toEqual([{ id: 'b', position: { x: 10, y: 20 } }])
  })

  it('右对齐按右缘（x + width）算，宽度不同的卡各自回退', () => {
    expect(
      alignNodes(
        [box('a', 0, 0, 100), box('b', 10, 20, 40)],
        NODE_ALIGN_EDGE_IDS.right,
      ),
    ).toEqual([{ id: 'b', position: { x: 60, y: 20 } }])
  })

  it('上对齐取最小 y，下对齐取最大下缘', () => {
    expect(
      alignNodes([box('a', 0, 30), box('b', 0, 5)], NODE_ALIGN_EDGE_IDS.top),
    ).toEqual([{ id: 'a', position: { x: 0, y: 5 } }])
    expect(
      alignNodes(
        [box('a', 0, 30, 100, 50), box('b', 0, 5, 100, 20)],
        NODE_ALIGN_EDGE_IDS.bottom,
      ),
    ).toEqual([{ id: 'b', position: { x: 0, y: 60 } }])
  })
})

describe('distributeNodes', () => {
  it('少于三张卡时什么都不动', () => {
    expect(
      distributeNodes(
        [box('a', 0, 0), box('b', 300, 0)],
        NODE_DISTRIBUTE_AXIS_IDS.horizontal,
      ),
    ).toEqual([])
  })

  it('两端不动，中间按等间隙落位', () => {
    // 跨度 0→500，三张各宽 100 → 剩 200 分两段，每段 100。
    expect(
      distributeNodes(
        [box('a', 0, 0), box('b', 40, 0), box('c', 400, 0)],
        NODE_DISTRIBUTE_AXIS_IDS.horizontal,
      ),
    ).toEqual([{ id: 'b', position: { x: 200, y: 0 } }])
  })

  it('纵向等距按高度算间隙', () => {
    expect(
      distributeNodes(
        [
          box('a', 0, 0, 100, 50),
          box('b', 0, 10, 100, 50),
          box('c', 0, 250, 100, 50),
        ],
        NODE_DISTRIBUTE_AXIS_IDS.vertical,
      ),
    ).toEqual([{ id: 'b', position: { x: 0, y: 125 } }])
  })

  it('卡已经把跨度占满时不产生负间距', () => {
    expect(
      distributeNodes(
        [box('a', 0, 0, 100), box('b', 50, 0, 100), box('c', 100, 0, 100)],
        NODE_DISTRIBUTE_AXIS_IDS.horizontal,
      ),
    ).toEqual([])
  })
})
