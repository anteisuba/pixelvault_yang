import { describe, expect, it } from 'vitest'

import { AI_MODELS, MODEL_OPTIONS, getModelVariant } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  DEFAULT_VIDEO_NODE_MODE,
  VIDEO_NODE_MODES,
  getModelsForNodeMode,
  getNodeModeForModel,
  resolveVideoModelId,
  variantSupportsMode,
} from '@/constants/video-node-modes'

/**
 * 视频节点三档模式与端点解析。设计见
 * `docs/references/pages/canvas-video-card.md` §6。
 */

describe('video node modes', () => {
  it('sorts every available video model into exactly one mode', () => {
    // 漏掉的模型会在选择器里三档都不出现 —— 用户永远选不到它。
    const available = MODEL_OPTIONS.filter(
      (m) => m.outputType === 'VIDEO' && m.available,
    )
    const covered = VIDEO_NODE_MODES.flatMap((mode) =>
      getModelsForNodeMode(mode),
    )
    expect(covered.length).toBe(available.length)
    for (const model of available) {
      expect(
        VIDEO_NODE_MODES,
        `${model.id} fell outside all three modes`,
      ).toContain(getNodeModeForModel(model.id, model.adapterType))
    }
  })

  it('keeps the default mode populated', () => {
    // keyframe 是默认档，空了等于打开节点就没模型可选。
    expect(
      getModelsForNodeMode(DEFAULT_VIDEO_NODE_MODE).length,
    ).toBeGreaterThan(0)
  })

  it('⭐ resolves the same variant to different endpoints per mode', () => {
    // 这条是「用户只看见 Seedance 2.0、端点由模式挑」的核心验证：同一个型号 +
    // 同一个渠道，换模式必须落到**不同的** AI_MODELS 条目。
    expect(
      resolveVideoModelId('seedance-2.0', AI_ADAPTER_TYPES.FAL, 'keyframe'),
    ).toBe(AI_MODELS.SEEDANCE_20)
    expect(
      resolveVideoModelId('seedance-2.0', AI_ADAPTER_TYPES.FAL, 'multimodal'),
    ).toBe(AI_MODELS.SEEDANCE_20_REFERENCE)

    expect(
      resolveVideoModelId(
        'seedance-2.5',
        AI_ADAPTER_TYPES.VOLCENGINE,
        'keyframe',
      ),
    ).toBe(AI_MODELS.SEEDANCE_25_VOLCENGINE)
    expect(
      resolveVideoModelId(
        'seedance-2.5',
        AI_ADAPTER_TYPES.VOLCENGINE,
        'multimodal',
      ),
    ).toBe(AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE)
    expect(
      resolveVideoModelId('seedance-2.5', AI_ADAPTER_TYPES.FAL, 'keyframe'),
    ).toBe(AI_MODELS.SEEDANCE_25)
    expect(
      resolveVideoModelId(
        'seedance-2.5',
        AI_ADAPTER_TYPES.BYTEPLUS,
        'multimodal',
      ),
    ).toBe(AI_MODELS.SEEDANCE_25_REFERENCE_BYTEPLUS)
  })

  it('returns null instead of falling back to a wrong endpoint', () => {
    // Kling 没有多模态参考端点。回退到 keyframe 端点会让用户以为在用全能参考、
    // 实际发出去的是首帧请求 —— 宁可让这个型号从列表消失。
    expect(
      resolveVideoModelId('kling-v3-pro', AI_ADAPTER_TYPES.FAL, 'multimodal'),
    ).toBeNull()
    expect(variantSupportsMode('kling-v3-pro', 'multimodal')).toBe(false)
    expect(variantSupportsMode('kling-v3-pro', 'keyframe')).toBe(true)
  })

  it('round-trips resolve → mode for every variant/channel it can reach', () => {
    for (const mode of VIDEO_NODE_MODES) {
      for (const model of getModelsForNodeMode(mode)) {
        const variant = getModelVariant(model.id)
        if (!variant) continue
        const resolved = resolveVideoModelId(variant, model.adapterType, mode)
        expect(resolved, `${variant}/${model.adapterType}/${mode}`).toBe(
          model.id,
        )
        expect(getNodeModeForModel(resolved!, model.adapterType)).toBe(mode)
      }
    }
  })

  /**
   * 台账 U（2026-08-29）：切档必须**跟着型号走**，不是跟着端点 id 走。
   * 这两条是那条 bug 的回归闸 —— 第一条如果再回到「按 modelId 判留不留」就会红。
   */
  it('keeps the same variant across a mode switch by re-resolving its endpoint', () => {
    const keyframeEndpoint = resolveVideoModelId(
      getModelVariant(AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE)!,
      AI_ADAPTER_TYPES.VOLCENGINE,
      'keyframe',
    )
    const multimodalEndpoint = resolveVideoModelId(
      getModelVariant(AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE)!,
      AI_ADAPTER_TYPES.VOLCENGINE,
      'multimodal',
    )
    // 同一个型号，两档下是两个不同的端点 —— 正是「按 id 判留不留」必然误判的原因。
    expect(keyframeEndpoint).not.toBe(multimodalEndpoint)
    expect(multimodalEndpoint).not.toBeNull()
    expect(getNodeModeForModel(multimodalEndpoint!)).toBe('multimodal')
  })

  it('returns null when the variant has no endpoint in the target mode', () => {
    // 真的解析不出来时才该清掉选择（`selectMode` 的回落分支）。
    expect(
      resolveVideoModelId(
        getModelVariant(AI_MODELS.KLING_V3_PRO)!,
        AI_ADAPTER_TYPES.FAL,
        'multimodal',
      ),
    ).toBeNull()
  })
})
