import { describe, expect, it } from 'vitest'

import { AI_MODELS, getModelById } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { DEFAULT_VIDEO_VARIANT } from '@/constants/video-node-modes'
import {
  pickDefaultVideoModel,
  resolveVideoModelForMode,
} from '@/lib/video-node-model-resolver'
import type { NodeWorkflowModelOption } from '@/types/node-workflow'

function opt(
  modelId: string,
  sourceType: 'workspace' | 'saved' = 'workspace',
): NodeWorkflowModelOption {
  const model = getModelById(modelId)
  return {
    optionId: `${sourceType}:${modelId}`,
    modelId,
    adapterType: model?.adapterType ?? AI_ADAPTER_TYPES.FAL,
    providerConfig: { label: 'Test', baseUrl: 'https://example.test' },
    requestCount: 0,
    sourceType,
    ...(sourceType === 'saved' ? { apiKeyId: `key-${modelId}` } : {}),
  }
}

/**
 * ⚠ 必须**包含 2.5**。旧解析器的夹具只有 2.0 八条，`0fa75286` 接 2.5 时没扩它，
 * 于是「2.0 与 2.5 撞进同一格」整整一轮没被任何测试碰到（见 be236178）。
 * 往目录里加同系列新代次时，这里跟着加。
 */
const ALL_OPTIONS = [
  AI_MODELS.SEEDANCE_20,
  AI_MODELS.SEEDANCE_20_FAST,
  AI_MODELS.SEEDANCE_20_REFERENCE,
  AI_MODELS.SEEDANCE_20_FAST_REFERENCE,
  AI_MODELS.SEEDANCE_20_VOLCENGINE,
  AI_MODELS.SEEDANCE_20_FAST_VOLCENGINE,
  AI_MODELS.SEEDANCE_20_REFERENCE_VOLCENGINE,
  AI_MODELS.SEEDANCE_20_FAST_REFERENCE_VOLCENGINE,
  AI_MODELS.SEEDANCE_25_VOLCENGINE,
  AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE,
  AI_MODELS.KLING_V3_PRO,
  AI_MODELS.GEMINI_OMNI_FLASH,
].map((id) => opt(id))

function selection(modelId: string) {
  const model = getModelById(modelId)
  return {
    optionId: `workspace:${modelId}`,
    modelId,
    adapterType: model?.adapterType ?? AI_ADAPTER_TYPES.FAL,
    providerConfig: { label: 'Test', baseUrl: 'https://example.test' },
  }
}

const resolved = (modelId: string, mode: 'keyframe' | 'multimodal') =>
  resolveVideoModelForMode(selection(modelId), mode, ALL_OPTIONS)?.modelId ??
  null

describe('resolveVideoModelForMode', () => {
  it('端点由模式挑，同一个型号在两档下落到不同条目', () => {
    // 这是「用户只看见 Seedance 2.5、reference 这个词不出现在 UI 里」成立的那一步。
    expect(resolved(AI_MODELS.SEEDANCE_25_VOLCENGINE, 'keyframe')).toBe(
      AI_MODELS.SEEDANCE_25_VOLCENGINE,
    )
    expect(resolved(AI_MODELS.SEEDANCE_25_VOLCENGINE, 'multimodal')).toBe(
      AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE,
    )
    // 反向：选中的是参考条目，切回关键帧档就该落到非参考端点。
    expect(
      resolved(AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE, 'keyframe'),
    ).toBe(AI_MODELS.SEEDANCE_25_VOLCENGINE)
  })

  it('**不再按有没有接参考自动判** —— 模式说关键帧就是关键帧', () => {
    // 旧实现（reference-by-input）在这里会因为「接了参考」把用户换到参考端点上。
    // 现在输入根本不参与解析：同一个调用，无论节点上接了什么，结果只由模式决定。
    expect(resolved(AI_MODELS.SEEDANCE_20_VOLCENGINE, 'keyframe')).toBe(
      AI_MODELS.SEEDANCE_20_VOLCENGINE,
    )
  })

  it('保住渠道 —— 换端点不换供应商', () => {
    expect(resolved(AI_MODELS.SEEDANCE_20, 'multimodal')).toBe(
      AI_MODELS.SEEDANCE_20_REFERENCE,
    )
    expect(resolved(AI_MODELS.SEEDANCE_20_VOLCENGINE, 'multimodal')).toBe(
      AI_MODELS.SEEDANCE_20_REFERENCE_VOLCENGINE,
    )
  })

  it('绝不把 2.5 解析成 2.0（旧解析器的那个静默降级）', () => {
    for (const mode of ['keyframe', 'multimodal'] as const) {
      const hit = resolved(AI_MODELS.SEEDANCE_25_VOLCENGINE, mode)
      expect(hit).toContain('2.5')
    }
  })

  it('该型号在这一档下无解时返回 null，调用方保留原选择', () => {
    // Kling 没有多模态端点。回退到别的端点意味着用户以为在用全能参考、实际发首帧。
    expect(resolved(AI_MODELS.KLING_V3_PRO, 'multimodal')).toBeNull()
    // Gemini Omni 只在「多图参考」档，关键帧档下无解。
    expect(resolved(AI_MODELS.GEMINI_OMNI_FLASH, 'keyframe')).toBeNull()
  })

  it('目录里有但用户清单里没有那一条时返回 null', () => {
    const onlyNonReference = ALL_OPTIONS.filter(
      (o) => !o.modelId.includes('reference'),
    )
    expect(
      resolveVideoModelForMode(
        selection(AI_MODELS.SEEDANCE_25_VOLCENGINE),
        'multimodal',
        onlyNonReference,
      ),
    ).toBeNull()
  })

  it('没有模型时返回 null', () => {
    expect(
      resolveVideoModelForMode(undefined, 'keyframe', ALL_OPTIONS),
    ).toBeNull()
  })
})

describe('pickDefaultVideoModel', () => {
  it('按默认型号挑，端点跟着模式走', () => {
    expect(
      pickDefaultVideoModel(DEFAULT_VIDEO_VARIANT, 'keyframe', ALL_OPTIONS)
        ?.modelId,
    ).toBe(AI_MODELS.SEEDANCE_20_FAST)
    expect(
      pickDefaultVideoModel(DEFAULT_VIDEO_VARIANT, 'multimodal', ALL_OPTIONS)
        ?.modelId,
    ).toBe(AI_MODELS.SEEDANCE_20_FAST_REFERENCE)
  })

  it('优先用户自带 key 的那个渠道', () => {
    const withSavedVolc = ALL_OPTIONS.map((o) =>
      o.modelId === AI_MODELS.SEEDANCE_20_FAST_VOLCENGINE
        ? opt(o.modelId, 'saved')
        : o,
    )
    expect(
      pickDefaultVideoModel(DEFAULT_VIDEO_VARIANT, 'keyframe', withSavedVolc)
        ?.modelId,
    ).toBe(AI_MODELS.SEEDANCE_20_FAST_VOLCENGINE)
  })

  /**
   * ⚠ 2026-09-02 翻面：这条用例原本断言「退到 Gemini Omni」——「多图参考」档里
   * 没有任何 Seedance，而 Veo 3.1 / LTX 2.3 早已 `available: false`，于是那一档
   * 只剩 Gemini Omni 一个。**而它是假可用的**：worker 从来没 allowlist 过 GEMINI
   * （`WORKER_CAPABLE_VIDEO_ADAPTERS`），选中必吃 501，所以它进了
   * `RESERVED_MODEL_IDS`、`available` 翻成 false。
   *
   * 结论随之翻面：**「多图参考」档目前一条能跑的模型都没有**，`pickDefaultVideoModel`
   * 只能返回 null。⛔ 这里不改成「退到别的档」—— 那正是本文件头注禁止的回退
   * （用户以为在用多图参考、实际发的是首帧）。这条红字是给下一个人看的：要么给
   * 这一档接一个真能跑的模型，要么把这一档从 UI 上收掉。
   */
  it('这一档一条能跑的模型都没有时返回 null（⛔ 不偷偷换档）', () => {
    const hit = pickDefaultVideoModel(
      DEFAULT_VIDEO_VARIANT,
      'image-reference',
      ALL_OPTIONS,
    )
    expect(hit).toBeNull()
  })

  it('清单为空时返回 null 而不是抛', () => {
    expect(
      pickDefaultVideoModel(DEFAULT_VIDEO_VARIANT, 'keyframe', []),
    ).toBeNull()
  })
})
