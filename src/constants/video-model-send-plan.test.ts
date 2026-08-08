import { describe, expect, it } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

import { getVideoModelSendContract } from './video-model-send-plan'

describe('video model send contracts', () => {
  it('defines Seedance Reference as a 12-item multimodal pool', () => {
    const contract = getVideoModelSendContract(
      AI_MODELS.SEEDANCE_20_FAST_REFERENCE,
      AI_ADAPTER_TYPES.FAL,
    )

    expect(contract).toMatchObject({
      family: 'seedance',
      referenceMode: 'multimodal-reference',
      slots: {
        images: 9,
        videos: 3,
        audio: 3,
        total: 12,
        audioRequiresVisual: true,
      },
      execution: 'ready',
      positionalImageTokens: true,
    })
  })

  it.each([
    [AI_MODELS.KLING_V3_PRO, 'kling'],
    [AI_MODELS.KLING_O3_PRO, 'kling'],
    [AI_MODELS.HAPPYHORSE_10, 'happyhorse'],
  ] as const)('%s accepts one first frame only', (modelId, family) => {
    const contract = getVideoModelSendContract(modelId, AI_ADAPTER_TYPES.FAL)

    expect(contract.family).toBe(family)
    expect(contract.referenceMode).toBe('text-or-first-frame')
    expect(contract.slots).toEqual({
      images: 1,
      videos: 0,
      audio: 0,
    })
    expect(contract.execution).toBe('ready')
  })

  it('does not invent a Gemini image cap and reports its missing worker route', () => {
    const contract = getVideoModelSendContract(
      AI_MODELS.GEMINI_OMNI_FLASH,
      AI_ADAPTER_TYPES.GEMINI,
    )

    expect(contract.referenceMode).toBe('image-content-array')
    expect(contract.slots.images).toBeUndefined()
    expect(contract.slots.videos).toBe(0)
    expect(contract.slots.audio).toBe(0)
    expect(contract.execution).toBe('execution-not-migrated')
  })

  it('does not mark an unknown Fal video model runnable from its adapter alone', () => {
    const contract = getVideoModelSendContract(
      'custom-fal-video-model',
      AI_ADAPTER_TYPES.FAL,
    )

    expect(contract.family).toBe('fallback')
    expect(contract.execution).toBe('execution-not-migrated')
  })
})

describe('首尾帧能力声明（切片 6 第 ③④ 层）', () => {
  it('火山线的关键帧档给两个具名槽，且槽位放宽到两张', () => {
    // 只声明槽位而不放宽 images，第二张会在发送前被截掉；只放宽 images 而不声明
    // 槽位，第二张会被当成一张无语义的参考图 —— 首尾帧从未生效正是卡在这两层。
    for (const id of [
      AI_MODELS.SEEDANCE_20_VOLCENGINE,
      AI_MODELS.SEEDANCE_20_FAST_VOLCENGINE,
      AI_MODELS.SEEDANCE_25_VOLCENGINE,
    ]) {
      const contract = getVideoModelSendContract(
        id,
        AI_ADAPTER_TYPES.VOLCENGINE,
      )
      expect(contract.keyframeSlots, id).toBe(2)
      expect(contract.slots.images, id).toBe(2)
    }
  })

  it('worker 发不出 last_frame 的模型一律只给一个槽', () => {
    // ⚠ 判据是「我们的 builder 发得出来吗」，不是「上游支不支持」。fal 的 builder
    // 里根本没有帧角色概念，minimax 只发 first_frame —— 声明得比实现宽，用户填了
    // 尾帧就会被静默丢掉。
    for (const [id, adapter] of [
      [AI_MODELS.SEEDANCE_20, AI_ADAPTER_TYPES.FAL],
      [AI_MODELS.SEEDANCE_20_FAST, AI_ADAPTER_TYPES.FAL],
      [AI_MODELS.MINIMAX_H3, AI_ADAPTER_TYPES.MINIMAX],
      [AI_MODELS.KLING_V3_PRO, AI_ADAPTER_TYPES.FAL],
      [AI_MODELS.HAPPYHORSE_10, AI_ADAPTER_TYPES.FAL],
    ] as const) {
      const contract = getVideoModelSendContract(id, adapter)
      expect(contract.keyframeSlots, id).toBe(1)
      expect(contract.slots.images, id).toBe(1)
    }
  })

  it('参考端点没有首尾帧 —— 三种场景互斥', () => {
    // 火山明说 first-frame i2v / first+last frame / multimodal reference 三选一。
    for (const id of [
      AI_MODELS.SEEDANCE_20_REFERENCE_VOLCENGINE,
      AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE,
    ]) {
      expect(
        getVideoModelSendContract(id, AI_ADAPTER_TYPES.VOLCENGINE)
          .keyframeSlots,
        id,
      ).toBe(1)
    }
  })
})
