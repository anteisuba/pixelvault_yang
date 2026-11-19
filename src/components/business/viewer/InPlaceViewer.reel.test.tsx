import { describe, expect, it } from 'vitest'

import {
  REEL_NEIGHBOR_GAP_PX,
  REEL_NEIGHBOR_SCALE,
  reelOffsetX,
} from '@/components/business/viewer/InPlaceViewer'

/**
 * 查看器舞台的邻居。
 * - 2026-11-17 生产实测：下一张半透明地盖在主图右缘上 → 邻居内缘必须在主图外缘之外。
 * - 2026-11-19 库走查：主图只占中间约 390、两边露半张邻居 → 主图放到最大，邻居平时整张
 *   落在舞台外（只在翻图那一下滑进来）。
 * jsdom 量不到舞台，所以只锁几何。
 */
describe('reelOffsetX · 邻居不压主图、平时不露', () => {
  const stageWidth = 1000

  it.each([
    { label: '同宽横图', currentWidth: 1000, neighborWidth: 1000 },
    { label: '竖图主图 + 横图邻居', currentWidth: 400, neighborWidth: 1000 },
    { label: '竖图邻居', currentWidth: 620, neighborWidth: 300 },
    { label: '极窄邻居', currentWidth: 300, neighborWidth: 40 },
  ])(
    '$label：右邻居左缘在主图右缘与舞台右缘之外，恰好一道缝',
    ({ currentWidth, neighborWidth }) => {
      const x = reelOffsetX({
        offset: 1,
        currentHalfWidth: currentWidth / 2,
        width: neighborWidth,
        stageWidth,
      })
      const neighborLeft = x - (neighborWidth * REEL_NEIGHBOR_SCALE) / 2
      const innerEdge = Math.max(currentWidth / 2, stageWidth / 2)
      expect(neighborLeft - innerEdge).toBeCloseTo(REEL_NEIGHBOR_GAP_PX)
      expect(neighborLeft).toBeGreaterThan(stageWidth / 2)
    },
  )

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
