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
    const { topbarAddStep, topbarAddCascadeLimit, spawnFootprint } =
      NODE_STUDIO_NODE_PLACEMENT

    // ⚠ C3c-③d-2 真机 ③：占用判据从「一个错位步进（64）」改成「一张卡的占地」。
    // 旧判据下顺延一格的落点与原卡仍重叠 85%——避让顺延了，但没解决重叠。
    it('视口中心被占时，顺延到第一个真正空出来的格位', () => {
      const spawned = resolveTopbarAddSpawnPosition(center, 0, [center])
      expect(spawned).not.toEqual(center)
      // 错位链上的六格全在一张卡的占地之内，所以直接跳到占地网格的第一环。
      expect(
        Math.abs(spawned.x - center.x) >= spawnFootprint.width ||
          Math.abs(spawned.y - center.y) >= spawnFootprint.height,
      ).toBe(true)
    })

    it('落点与已有节点在两轴上不再重叠', () => {
      const occupied = [
        center,
        { x: center.x + spawnFootprint.width, y: center.y },
      ]
      const spawned = resolveTopbarAddSpawnPosition(center, 0, occupied)
      for (const node of occupied) {
        expect(
          Math.abs(node.x - spawned.x) >= spawnFootprint.width ||
            Math.abs(node.y - spawned.y) >= spawnFootprint.height,
        ).toBe(true)
      }
    })

    it('只有一轴接近不算占住', () => {
      // 同一个 y，但 x 差了整整一张卡的占地：卡不重叠，不该被判成占住。
      const nearMiss = [{ x: center.x + spawnFootprint.width, y: center.y }]
      expect(resolveTopbarAddSpawnPosition(center, 0, nearMiss)).toEqual(center)
    })

    it('周围整片都满时退回原落点，绝不无限飘远', () => {
      const { spawnGridRings } = NODE_STUDIO_NODE_PLACEMENT
      const everywhere: { x: number; y: number }[] = []
      for (let dx = -spawnGridRings; dx <= spawnGridRings; dx += 1) {
        for (let dy = -spawnGridRings; dy <= spawnGridRings; dy += 1) {
          everywhere.push({
            x: center.x + dx * spawnFootprint.width,
            y: center.y + dy * spawnFootprint.height,
          })
        }
      }
      expect(resolveTopbarAddSpawnPosition(center, 0, everywhere)).toEqual(
        center,
      )
    })

    it('空画布上仍按错位步进走，不被占地网格接管', () => {
      expect(resolveTopbarAddSpawnPosition(center, 0)).toEqual(center)
      expect(resolveTopbarAddSpawnPosition(center, 2, [])).toEqual({
        x: center.x + 2 * topbarAddStep.x,
        y: center.y + 2 * topbarAddStep.y,
      })
      expect(topbarAddCascadeLimit).toBeGreaterThan(0)
    })
  })
})
