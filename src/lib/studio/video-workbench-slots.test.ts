import { describe, expect, it } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

import { getVideoWorkbenchSlots } from './video-workbench-slots'

/**
 * 具名槽的**可见性判据**（第二期）。
 *
 * 钉四件事：
 *  ① 关键帧档才有首帧槽 —— 另外两档里图片不是帧；
 *  ② 尾帧槽跟 `keyframeSlots === 2` 走，也就是「**我们的 worker 发得出来吗**」，
 *    ⛔ 不是「上游支不支持」；声明得比实现宽 = 用户填了尾帧被静默丢掉；
 *  ③ 参考视频槽的容量直接来自契约的 `slots.videos`；
 *  ④ 还没选模型时**一个槽都不出**（⛔ 不猜一个默认模型的能力：那会让槽在选完
 *    模型之后突然消失）。
 */
describe('getVideoWorkbenchSlots', () => {
  it('Seedance 2.5 关键帧档：首帧 + 尾帧都在', () => {
    const slots = getVideoWorkbenchSlots(
      AI_MODELS.SEEDANCE_25_VOLCENGINE,
      AI_ADAPTER_TYPES.VOLCENGINE,
    )
    expect(slots.first).toBe(true)
    expect(slots.last).toBe(true)
  })

  it('多图参考档不出帧槽 —— 那一档的图是内容参考，不是帧', () => {
    const slots = getVideoWorkbenchSlots(
      AI_MODELS.SEEDANCE_20_REFERENCE,
      AI_ADAPTER_TYPES.FAL,
    )
    expect(slots.first).toBe(false)
    expect(slots.last).toBe(false)
    // 全能 / 多图参考档才有参考视频位
    expect(slots.videos).toBeGreaterThan(0)
  })

  it('还没选模型时一个槽都不出', () => {
    expect(getVideoWorkbenchSlots(undefined)).toEqual({
      first: false,
      last: false,
      videos: 0,
    })
  })
})
