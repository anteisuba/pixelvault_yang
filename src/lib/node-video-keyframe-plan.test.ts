import { describe, expect, it } from 'vitest'

import { AI_MODELS } from '@/constants/models'

import { planVideoKeyframeImages } from './node-video-keyframe-plan'

const FIRST = 'https://cdn.test/first.png'
const LAST = 'https://cdn.test/last.png'
const CHAR = 'https://cdn.test/character.png'

/** 关键帧档（非参考端点），两个槽。 */
const KEYFRAME_MODEL = AI_MODELS.SEEDANCE_20_VOLCENGINE
/** 参考端点：走多模态那一档，不谈首尾。 */
const REFERENCE_MODEL = AI_MODELS.SEEDANCE_20_REFERENCE_VOLCENGINE

describe('planVideoKeyframeImages', () => {
  it('两张关键帧 → 原样送出，顺序即首→尾', () => {
    const plan = planVideoKeyframeImages({
      imageUrls: [FIRST, LAST],
      keyframeUrls: [FIRST, LAST],
      modelId: KEYFRAME_MODEL,
    })

    expect(plan.imageUrls).toEqual([FIRST, LAST])
    expect(plan.dropped).toEqual([])
  })

  it('⚠ 1 张首帧 + 1 张角色图 → 角色图**不会**被当成尾帧', () => {
    // 这条正是这个函数存在的理由：适配器按位置取，收割顺序是「关键帧在前，其余跟后」，
    // 只靠位置就会把角色图发成 last_frame，视频以一张不相干的图结尾。
    const plan = planVideoKeyframeImages({
      imageUrls: [FIRST, CHAR],
      keyframeUrls: [FIRST],
      modelId: KEYFRAME_MODEL,
    })

    expect(plan.imageUrls).toEqual([FIRST])
    expect(plan.dropped).toEqual([CHAR])
  })

  it('一张关键帧都没标 → 第一张当首帧（关键帧档一直以来的经典 i2v）', () => {
    const plan = planVideoKeyframeImages({
      imageUrls: [CHAR, FIRST],
      keyframeUrls: [],
      modelId: KEYFRAME_MODEL,
    })

    expect(plan.imageUrls).toEqual([CHAR])
    expect(plan.dropped).toEqual([FIRST])
  })

  it('关键帧已被上游的 cap / @ 过滤切掉 → 不拿它凑数', () => {
    // keyframeUrls 里有 LAST，但它没活到候选里。选它等于发明了一帧没发出去的图。
    const plan = planVideoKeyframeImages({
      imageUrls: [FIRST, CHAR],
      keyframeUrls: [FIRST, LAST],
      modelId: KEYFRAME_MODEL,
    })

    expect(plan.imageUrls).toEqual([FIRST])
    expect(plan.dropped).toEqual([CHAR])
  })

  it('超过两张关键帧 → 只取前两张，其余进 dropped 而不是静默消失', () => {
    const extra = 'https://cdn.test/third.png'
    const plan = planVideoKeyframeImages({
      imageUrls: [FIRST, LAST, extra],
      keyframeUrls: [FIRST, LAST, extra],
      modelId: KEYFRAME_MODEL,
    })

    expect(plan.imageUrls).toEqual([FIRST, LAST])
    expect(plan.dropped).toEqual([extra])
  })

  it('参考端点 → 一律原样透传，这个函数不插手', () => {
    const plan = planVideoKeyframeImages({
      imageUrls: [FIRST, LAST, CHAR],
      keyframeUrls: [FIRST, LAST],
      modelId: REFERENCE_MODEL,
    })

    expect(plan.imageUrls).toEqual([FIRST, LAST, CHAR])
    expect(plan.dropped).toEqual([])
  })

  it('不认识的模型 → 原样透传，不猜', () => {
    const plan = planVideoKeyframeImages({
      imageUrls: [FIRST, CHAR],
      keyframeUrls: [FIRST],
      modelId: undefined,
    })

    expect(plan.imageUrls).toEqual([FIRST, CHAR])
    expect(plan.dropped).toEqual([])
  })
})
