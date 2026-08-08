import { describe, expect, it } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { AI_MODELS } from '@/constants/models'
import { getVideoModelSendContract } from '@/constants/video-model-send-plan'

import { resolveVideoSendSlotLimits } from './node-video-send-slots'

function limitsFor(
  modelId: string | undefined,
  candidates: { audio?: number; videos?: number } = {},
) {
  return resolveVideoSendSlotLimits({
    contract: getVideoModelSendContract(modelId, AI_ADAPTER_TYPES.VOLCENGINE),
    legacyMode: !modelId,
    legacyMaxReferenceImages: 4,
    audioCandidateCount: candidates.audio ?? 0,
    videoCandidateCount: candidates.videos ?? 0,
  })
}

describe('resolveVideoSendSlotLimits', () => {
  it('⚠ 多图参考档：视频与音频的容量是 0', () => {
    // 这就是「藏着却发出去」的根 —— 发送路径此前写死 .slice(0, 3)，
    // 于是多图参考档照发三条视频，火山 400（cleanup §8.7 第 1 条）。
    const limits = limitsFor(AI_MODELS.GEMINI_OMNI_FLASH, {
      audio: 2,
      videos: 2,
    })

    expect(limits.videos).toBe(0)
    expect(limits.audio).toBe(0)
  })

  it('全能参考档：图 / 视频 / 音频都有位置', () => {
    const limits = limitsFor(AI_MODELS.SEEDANCE_20_REFERENCE_VOLCENGINE)

    expect(limits.videos).toBeGreaterThan(0)
    expect(limits.audio).toBeGreaterThan(0)
    expect(limits.images).toBeGreaterThan(1)
  })

  it('关键帧档：两个具名槽位，视频与音频没有位置', () => {
    const limits = limitsFor(AI_MODELS.SEEDANCE_20_VOLCENGINE)

    expect(limits.images).toBe(2)
    expect(limits.videos).toBe(0)
    expect(limits.audio).toBe(0)
  })

  it('跨模态总额：视频和音频先占，图片吃剩下的', () => {
    const bare = limitsFor(AI_MODELS.SEEDANCE_20_REFERENCE_VOLCENGINE)
    const crowded = limitsFor(AI_MODELS.SEEDANCE_20_REFERENCE_VOLCENGINE, {
      audio: 3,
      videos: 3,
    })

    expect(crowded.images).toBeLessThan(bare.images)
  })

  it('⚠ 候选超额时按**实际采用数**扣总额，不按候选数', () => {
    // 拿候选数扣，会让「发不出去的那几条」把图片的位置也一起吃掉。
    const contract = getVideoModelSendContract(
      AI_MODELS.SEEDANCE_20_REFERENCE_VOLCENGINE,
      AI_ADAPTER_TYPES.VOLCENGINE,
    )
    const atCap = resolveVideoSendSlotLimits({
      contract,
      legacyMode: false,
      legacyMaxReferenceImages: 4,
      audioCandidateCount: contract.slots.audio,
      videoCandidateCount: contract.slots.videos,
    })
    const wayOver = resolveVideoSendSlotLimits({
      contract,
      legacyMode: false,
      legacyMaxReferenceImages: 4,
      audioCandidateCount: contract.slots.audio + 50,
      videoCandidateCount: contract.slots.videos + 50,
    })

    expect(wayOver.images).toBe(atCap.images)
  })

  it('没选模型 → 退回调用方给的老上限，不猜', () => {
    const limits = limitsFor(undefined)

    expect(limits.images).toBe(4)
    expect(limits.videos).toBe(3)
    expect(limits.audio).toBe(3)
  })
})
