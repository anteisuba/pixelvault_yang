import { describe, expect, it } from 'vitest'

import {
  NODE_STUDIO_NODE_PLACEMENT,
  resolveTopbarAddSpawnPosition,
} from '@/constants/node-studio'

describe('resolveTopbarAddSpawnPosition（《画布修法》02 节刀 1 task A）', () => {
  const center = { x: 500, y: 300 }

  it('第一次新建（sequence=0）落在视口中心，不带任何错位', () => {
    expect(resolveTopbarAddSpawnPosition(center, 0)).toEqual(center)
  })

  it('连续新建按 topbarAddStep 错开，第 N 次落点各不相同', () => {
    const { topbarAddStep } = NODE_STUDIO_NODE_PLACEMENT
    const first = resolveTopbarAddSpawnPosition(center, 0)
    const second = resolveTopbarAddSpawnPosition(center, 1)
    const third = resolveTopbarAddSpawnPosition(center, 2)

    // 三次落点两两不同——回归"连点添加菜单三次会精确重叠在同一个坐标"那个 bug。
    expect(second).not.toEqual(first)
    expect(third).not.toEqual(second)
    expect(third).not.toEqual(first)

    expect(second).toEqual({
      x: center.x + topbarAddStep.x,
      y: center.y + topbarAddStep.y,
    })
    expect(third).toEqual({
      x: center.x + topbarAddStep.x * 2,
      y: center.y + topbarAddStep.y * 2,
    })
  })

  it('错位按 topbarAddCascadeLimit 取模回卷，不会无限飘出视口', () => {
    const { topbarAddCascadeLimit } = NODE_STUDIO_NODE_PLACEMENT

    const wrapped = resolveTopbarAddSpawnPosition(center, topbarAddCascadeLimit)
    const atStart = resolveTopbarAddSpawnPosition(center, 0)
    expect(wrapped).toEqual(atStart)

    // 就算连点几十次，落点也只在 cascadeLimit 个格位之间循环，不会持续远离视口中心。
    const farClick = resolveTopbarAddSpawnPosition(center, 47)
    const { topbarAddStep } = NODE_STUDIO_NODE_PLACEMENT
    const maxOffset = (topbarAddCascadeLimit - 1) * topbarAddStep.x
    expect(Math.abs(farClick.x - center.x)).toBeLessThanOrEqual(maxOffset)
    expect(Math.abs(farClick.y - center.y)).toBeLessThanOrEqual(maxOffset)
  })
})
