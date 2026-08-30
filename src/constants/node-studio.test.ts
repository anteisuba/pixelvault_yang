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

  /**
   * 台账 S（owner 2026-08-29 真机）：错位步进按的是「这一会话点了几次」，与那个
   * 位置上有没有东西无关 —— 第 0 次永远精确落在视口正中，而刚生成完的卡恰好被
   * 居中过（生成后自动选中 + 聚焦）。两次「+ → 镜头图」都盖住了刚出的图。
   */
  describe('碰撞避让', () => {
    const { topbarAddStep, topbarAddCascadeLimit } = NODE_STUDIO_NODE_PLACEMENT

    it('视口中心被占时，往下顺延到第一个空格位', () => {
      const spawned = resolveTopbarAddSpawnPosition(center, 0, [center])
      expect(spawned).not.toEqual(center)
      expect(spawned).toEqual({
        x: center.x + topbarAddStep.x,
        y: center.y + topbarAddStep.y,
      })
    })

    it('连着两格都被占就再顺延一格', () => {
      const occupied = [
        center,
        { x: center.x + topbarAddStep.x, y: center.y + topbarAddStep.y },
      ]
      expect(resolveTopbarAddSpawnPosition(center, 0, occupied)).toEqual({
        x: center.x + 2 * topbarAddStep.x,
        y: center.y + 2 * topbarAddStep.y,
      })
    })

    it('判据是两轴都在一个步进之内 —— 只有一轴接近不算占住', () => {
      // 同一个 y，但 x 差了整整一个步进：卡角必然错开，不该被判成占住。
      const nearMiss = [{ x: center.x + topbarAddStep.x, y: center.y }]
      expect(resolveTopbarAddSpawnPosition(center, 0, nearMiss)).toEqual(center)
    })

    it('整条错位链都满时退回原落点，绝不飘出视口', () => {
      const everySlot = Array.from(
        { length: topbarAddCascadeLimit },
        (_, index) => ({
          x: center.x + index * topbarAddStep.x,
          y: center.y + index * topbarAddStep.y,
        }),
      )
      expect(resolveTopbarAddSpawnPosition(center, 0, everySlot)).toEqual(
        center,
      )
    })

    it('不传清单时行为与改动前逐字相同', () => {
      expect(resolveTopbarAddSpawnPosition(center, 0)).toEqual(center)
      expect(resolveTopbarAddSpawnPosition(center, 2, [])).toEqual({
        x: center.x + 2 * topbarAddStep.x,
        y: center.y + 2 * topbarAddStep.y,
      })
    })
  })
})
