import { describe, expect, it } from 'vitest'

import { AI_MODELS, MODEL_OPTIONS } from '@/constants/models'
import { getVideoModelCapabilities } from '@/constants/video-model-capabilities'
import { getVideoModelSendContract } from '@/constants/video-model-send-plan'
import { VIDEO_REFERENCE_LIMITS } from '@/constants/video-reference-limits'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

/**
 * Seedance 2.5 契约守卫。
 *
 * ⚠ **这个文件的职责在 2026-08-08 变过一次。** 火山 08-07 上线 API 之后，它从
 * 「守住预留状态、拦住有人把占位族 id 连同 `available: true` 一起推上生产」改成
 * 「守住 GA 之后的契约」。文件名里的 `reservation` 是历史名，没跟着改是为了不
 * 打断 git 历史。
 *
 * 它防的是三类回归：
 *   1. 带日期 model id 被改回族 id —— 族 id 不可调用，且失败得很晚（提交时才 400）
 *   2. 2.5 与 2.0 的多模态上限互相污染 —— 两代数字不同，合并去重会让一边错
 *   3. 分辨率被顺手加上 1080p / 4k —— 2.5 没有这两档
 */

const SEEDANCE_25_IDS = [
  AI_MODELS.SEEDANCE_25,
  AI_MODELS.SEEDANCE_25_REFERENCE,
  AI_MODELS.SEEDANCE_25_VOLCENGINE,
  AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE,
  AI_MODELS.SEEDANCE_25_BYTEPLUS,
  AI_MODELS.SEEDANCE_25_REFERENCE_BYTEPLUS,
] as const

const CHANNELS = [
  {
    adapterType: AI_ADAPTER_TYPES.FAL,
    ids: [AI_MODELS.SEEDANCE_25, AI_MODELS.SEEDANCE_25_REFERENCE],
    externalIds: [
      'bytedance/seedance-2.5/text-to-video',
      'bytedance/seedance-2.5/reference-to-video',
    ],
  },
  {
    adapterType: AI_ADAPTER_TYPES.VOLCENGINE,
    ids: [
      AI_MODELS.SEEDANCE_25_VOLCENGINE,
      AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE,
    ],
    externalIds: ['doubao-seedance-2-5-260628'],
  },
  {
    adapterType: AI_ADAPTER_TYPES.BYTEPLUS,
    ids: [
      AI_MODELS.SEEDANCE_25_BYTEPLUS,
      AI_MODELS.SEEDANCE_25_REFERENCE_BYTEPLUS,
    ],
    externalIds: ['dreamina-seedance-2-5-260628'],
  },
] as const

const byId = new Map(MODEL_OPTIONS.map((model) => [model.id, model]))

describe('Seedance 2.5 contract', () => {
  it('uses the official callable ids on all three channels', () => {
    for (const channel of CHANNELS) {
      for (const id of channel.ids) {
        const model = byId.get(id)
        expect(model, `${id} missing from MODEL_OPTIONS`).toBeDefined()
        expect(channel.externalIds).toContain(model?.externalModelId)
      }
    }
  })

  it('is live', () => {
    for (const id of SEEDANCE_25_IDS) {
      expect(byId.get(id)?.available).toBe(true)
    }
  })

  it('exposes fal, VolcEngine China, and BytePlus international as three channels', () => {
    for (const channel of CHANNELS) {
      for (const id of channel.ids) {
        expect(byId.get(id)?.adapterType).toBe(channel.adapterType)
      }
    }
  })

  it('declares only the two resolutions 火山 actually ships', () => {
    // 2.5 没有 1080p / 4k —— 4k 是 2.0 独有的档。
    for (const id of SEEDANCE_25_IDS) {
      expect(getVideoModelCapabilities(id).supportedResolutions).toEqual([
        '480p',
        '720p',
      ])
    }
  })

  it('runs 4-30s, double the 2.0 window', () => {
    for (const id of SEEDANCE_25_IDS) {
      const durations = getVideoModelCapabilities(id).supportedDurations
      expect(durations?.[0]).toBe(4)
      expect(durations?.[durations.length - 1]).toBe(30)
    }
  })

  it('carries the 2.5 multimodal caps, not the 2.0 ones', () => {
    for (const [id, adapterType] of [
      [AI_MODELS.SEEDANCE_25_REFERENCE, AI_ADAPTER_TYPES.FAL],
      [AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE, AI_ADAPTER_TYPES.VOLCENGINE],
      [AI_MODELS.SEEDANCE_25_REFERENCE_BYTEPLUS, AI_ADAPTER_TYPES.BYTEPLUS],
    ] as const) {
      const contract = getVideoModelSendContract(id, adapterType)
      expect(contract.family).toBe('seedance')
      expect(contract.referenceMode).toBe('multimodal-reference')
      expect(contract.slots).toMatchObject({
        images: VIDEO_REFERENCE_LIMITS.IMAGES,
        videos: 10,
        audio: VIDEO_REFERENCE_LIMITS.AUDIO,
        total: 50,
      })
    }
    expect(
      getVideoModelSendContract(
        AI_MODELS.SEEDANCE_25_REFERENCE,
        AI_ADAPTER_TYPES.FAL,
      ).slots.audioRequiresVisual,
    ).toBe(true)
    expect(
      getVideoModelSendContract(
        AI_MODELS.SEEDANCE_25_REFERENCE_BYTEPLUS,
        AI_ADAPTER_TYPES.BYTEPLUS,
      ).slots.audioRequiresVisual,
    ).toBe(false)
  })

  it('leaves the 2.0 caps untouched', () => {
    // 分叉的另一半。2.5 放宽绝不能溢出到 2.0，否则 2.0 会拿到它接不住的数字。
    const contract = getVideoModelSendContract(
      AI_MODELS.SEEDANCE_20_REFERENCE_VOLCENGINE,
      AI_ADAPTER_TYPES.VOLCENGINE,
    )
    expect(contract.slots).toMatchObject({
      images: 9,
      videos: 3,
      audio: 3,
      total: 12,
      audioRequiresVisual: true,
    })

    const durations = getVideoModelCapabilities(
      AI_MODELS.SEEDANCE_20_VOLCENGINE,
    ).supportedDurations
    expect(durations?.[durations.length - 1]).toBe(15)
  })

  it('keeps the non-reference variant on the keyframe endpoint —— 现在是首尾两张', () => {
    // 这条原本断言 `images: 1`，锁的是「首尾帧从未实现」那个状态（cleanup §1）。
    // 2026-08-08 补上首尾帧后，关键帧档给两个**具名**槽位：首帧 + 尾帧。
    // ⚠ 与「多图参考」仍然互斥 —— referenceMode 不变，火山明说三种场景不能混。
    const contract = getVideoModelSendContract(
      AI_MODELS.SEEDANCE_25_VOLCENGINE,
      AI_ADAPTER_TYPES.VOLCENGINE,
    )
    expect(contract.referenceMode).toBe('text-or-first-frame')
    expect(contract.slots).toMatchObject({ images: 2, videos: 0, audio: 0 })
    expect(contract.keyframeSlots).toBe(2)
  })

  it('2.5 关键帧档带图时 ratio 被钉死成 adaptive', () => {
    // 火山对 2.5 的硬约束：首帧 / 首尾帧场景传具体宽高比会 400。
    // 参考端点不在这条约束里。
    expect(
      getVideoModelSendContract(
        AI_MODELS.SEEDANCE_25_VOLCENGINE,
        AI_ADAPTER_TYPES.VOLCENGINE,
      ).imageAspectRatioLock,
    ).toBe('adaptive')
    expect(
      getVideoModelSendContract(
        AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE,
        AI_ADAPTER_TYPES.VOLCENGINE,
      ).imageAspectRatioLock,
    ).toBeNull()
  })

  it('has a working execution path', () => {
    // 2026-08-01 `b4ecf638` 把火山 Seedance 迁进 execution worker 之后，这条断言
    // 从 'execution-not-migrated' 翻成 'ready'。
    for (const id of SEEDANCE_25_IDS) {
      const adapterType = byId.get(id)?.adapterType
      expect(getVideoModelSendContract(id, adapterType).execution).toBe('ready')
    }
  })
})
