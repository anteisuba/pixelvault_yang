import { describe, expect, it } from 'vitest'

import { AI_MODELS, MODEL_OPTIONS } from '@/constants/models'
import { getVideoModelCapabilities } from '@/constants/video-model-capabilities'
import { getVideoModelSendContract } from '@/constants/video-model-send-plan'
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
  AI_MODELS.SEEDANCE_25_VOLCENGINE,
  AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE,
] as const

/** 官方带日期 id，取自方舟「视频生成教程」的模型能力表（08-07 更新）。 */
const DATED_EXTERNAL_ID = 'doubao-seedance-2-5-260628'

/** 已发布的族 id —— 是个标识符，不是可调用的执行 id。 */
const FAMILY_ID_NOT_CALLABLE = 'doubao-seedance-2-5'

const byId = new Map(MODEL_OPTIONS.map((model) => [model.id, model]))

describe('Seedance 2.5 contract', () => {
  it('points at the dated model id, never the family id', () => {
    for (const id of SEEDANCE_25_IDS) {
      const model = byId.get(id)
      expect(model, `${id} missing from MODEL_OPTIONS`).toBeDefined()
      expect(model?.externalModelId).toBe(DATED_EXTERNAL_ID)
      expect(model?.externalModelId).not.toBe(FAMILY_ID_NOT_CALLABLE)
    }
  })

  it('is live', () => {
    for (const id of SEEDANCE_25_IDS) {
      expect(byId.get(id)?.available).toBe(true)
    }
  })

  it('routes to VolcEngine', () => {
    // BytePlus 国际站与 fal 将来各自是独立条目（前者要新 adapter type，因为 key
    // 与火山不通用；后者准入未澄清），不会复用这两个 id。
    for (const id of SEEDANCE_25_IDS) {
      expect(byId.get(id)?.adapterType).toBe(AI_ADAPTER_TYPES.VOLCENGINE)
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
    const contract = getVideoModelSendContract(
      AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE,
      AI_ADAPTER_TYPES.VOLCENGINE,
    )
    expect(contract.family).toBe('seedance')
    expect(contract.referenceMode).toBe('multimodal-reference')
    expect(contract.slots).toMatchObject({
      images: 30,
      videos: 10,
      audio: 10,
      total: 50,
      // 官方模型能力表「音频参考」行：只有 2.5 打 ✓，2.0 三档都写「需搭配图片/视频」。
      audioRequiresVisual: false,
    })
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

  it('keeps the non-reference variant on first-frame slots', () => {
    const contract = getVideoModelSendContract(
      AI_MODELS.SEEDANCE_25_VOLCENGINE,
      AI_ADAPTER_TYPES.VOLCENGINE,
    )
    expect(contract.referenceMode).toBe('text-or-first-frame')
    expect(contract.slots).toMatchObject({ images: 1, videos: 0, audio: 0 })
  })

  it('has a working execution path', () => {
    // 2026-08-01 `b4ecf638` 把火山 Seedance 迁进 execution worker 之后，这条断言
    // 从 'execution-not-migrated' 翻成 'ready'。
    for (const id of SEEDANCE_25_IDS) {
      expect(
        getVideoModelSendContract(id, AI_ADAPTER_TYPES.VOLCENGINE).execution,
      ).toBe('ready')
    }
  })
})
