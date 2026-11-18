import { describe, expect, it } from 'vitest'

import {
  REEL_NEIGHBOR_GAP_PX,
  REEL_NEIGHBOR_SCALE,
  reelOffsetX,
} from '@/components/business/viewer/InPlaceViewer'

/**
 * 查看器舞台的邻居（2026-11-17 生产实测：下一张半透明地盖在主图右缘上）。
 * jsdom 量不到舞台，所以只锁几何：邻居缩完之后的内缘，必须在当前那张的外缘之外。
 */
describe('reelOffsetX · 邻居不压主图', () => {
  const stageWidth = 1000
  // 当前那张占满 62% 宽（横图，最容易叠的情况）。
  const currentWidth = 620

  it.each([
    { label: '同宽横图', neighborWidth: 620 },
    { label: '竖图邻居', neighborWidth: 300 },
    { label: '极窄邻居', neighborWidth: 40 },
  ])('$label：右邻居左缘与主图右缘之间恰好一道缝', ({ neighborWidth }) => {
    const x = reelOffsetX({
      offset: 1,
      currentHalfWidth: currentWidth / 2,
      width: neighborWidth,
      stageWidth,
    })
    const neighborLeft = x - (neighborWidth * REEL_NEIGHBOR_SCALE) / 2
    const currentRight = currentWidth / 2
    expect(neighborLeft - currentRight).toBeCloseTo(REEL_NEIGHBOR_GAP_PX)
  })

  it('左右对称', () => {
    const args = { currentHalfWidth: 200, width: 500, stageWidth }
    expect(reelOffsetX({ ...args, offset: -1 })).toBe(
      -reelOffsetX({ ...args, offset: 1 }),
    )
  })

  it('当前那张不动；再远一格的候场在舞台外', () => {
    const args = { currentHalfWidth: 310, width: 620, stageWidth }
    expect(reelOffsetX({ ...args, offset: 0 })).toBe(0)
    expect(reelOffsetX({ ...args, offset: 2 })).toBe(stageWidth)
    expect(reelOffsetX({ ...args, offset: -2 })).toBe(-stageWidth)
  })
})
