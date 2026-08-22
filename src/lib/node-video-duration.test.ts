import { describe, expect, it } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { getVideoModelParameterOptions } from '@/constants/video-model-send-plan'
import { resolveNodeVideoDuration } from '@/lib/node-video-duration'

describe('resolveNodeVideoDuration', () => {
  it('lets Seedance 2.5 keep the long end of its own range (回归: 30 秒曾被写死的 4-15 吞掉)', () => {
    // 复现路径：用户在 2.5 节点的滑条上拖到 30 秒 → 落进 node.data.duration →
    // OSD 照实显示 30 秒 → 发送前被 `parsed > 15` 判成非法 → undefined →
    // provider 用自己的默认 5 秒出片。没有报错，没有 toast。
    for (const [modelId, adapterType] of [
      [AI_MODELS.SEEDANCE_25, AI_ADAPTER_TYPES.FAL],
      [AI_MODELS.SEEDANCE_25_VOLCENGINE, AI_ADAPTER_TYPES.VOLCENGINE],
      [AI_MODELS.SEEDANCE_25_REFERENCE_BYTEPLUS, AI_ADAPTER_TYPES.BYTEPLUS],
    ] as const) {
      for (const seconds of ['20', '25', '30']) {
        expect(
          resolveNodeVideoDuration({ raw: seconds, modelId, adapterType }),
        ).toBe(Number(seconds))
      }
    }
  })

  it('accepts every value the picker offers, for every video model', () => {
    // 真正的不变量：**滑条上能选的，发送时必须能活下来**。逐档比对，免得再出现
    // 「某一代放宽了档位而发送端还卡在上一代的窗口」。
    for (const [modelId, adapterType] of [
      [AI_MODELS.SEEDANCE_25, AI_ADAPTER_TYPES.FAL],
      [AI_MODELS.SEEDANCE_20, AI_ADAPTER_TYPES.FAL],
      [AI_MODELS.SEEDANCE_20_VOLCENGINE, AI_ADAPTER_TYPES.VOLCENGINE],
      [AI_MODELS.VEO_31, AI_ADAPTER_TYPES.FAL],
      [AI_MODELS.KLING_V3_PRO, AI_ADAPTER_TYPES.FAL],
      [AI_MODELS.MINIMAX_H3, AI_ADAPTER_TYPES.MINIMAX],
      [AI_MODELS.HAPPYHORSE_10, AI_ADAPTER_TYPES.FAL],
    ] as const) {
      const { durations } = getVideoModelParameterOptions(modelId, adapterType)
      expect(durations.length).toBeGreaterThan(0)
      for (const seconds of durations) {
        expect(
          resolveNodeVideoDuration({
            raw: String(seconds),
            modelId,
            adapterType,
          }),
        ).toBe(seconds)
      }
    }
  })

  it('drops a value the selected model does not offer', () => {
    // 2.5 的 30 秒放到 2.0 上不能溢出 —— 发出去只会被上游 400，或被 worker
    // 悄悄夹回 15。宁可发不出去让服务端默认值兜底。
    expect(
      resolveNodeVideoDuration({
        raw: '30',
        modelId: AI_MODELS.SEEDANCE_20,
        adapterType: AI_ADAPTER_TYPES.FAL,
      }),
    ).toBeUndefined()
    // Veo 只有 4/6/8：中间那些整秒同样不该混进去。
    expect(
      resolveNodeVideoDuration({
        raw: '5',
        modelId: AI_MODELS.VEO_31,
        adapterType: AI_ADAPTER_TYPES.FAL,
      }),
    ).toBeUndefined()
  })

  it('sends nothing for a model that has no duration knob at all', () => {
    // Gemini Omni 的契约写死 `duration: false`（时长由模型自己定），
    // `getVideoModelParameterOptions` 因此返回空数组 —— 和 VideoComposer 整栏
    // 不渲染滑条同一个判断。
    expect(
      getVideoModelParameterOptions(
        AI_MODELS.GEMINI_OMNI_FLASH,
        AI_ADAPTER_TYPES.GEMINI,
      ).durations,
    ).toEqual([])
    expect(
      resolveNodeVideoDuration({
        raw: '8',
        modelId: AI_MODELS.GEMINI_OMNI_FLASH,
        adapterType: AI_ADAPTER_TYPES.GEMINI,
      }),
    ).toBeUndefined()
  })

  it("passes 'auto' through verbatim", () => {
    expect(
      resolveNodeVideoDuration({
        raw: 'auto',
        modelId: AI_MODELS.SEEDANCE_25,
        adapterType: AI_ADAPTER_TYPES.FAL,
      }),
    ).toBe('auto')
    // 前后空白是文本框时代的遗产，不该改变语义。
    expect(
      resolveNodeVideoDuration({
        raw: '  auto  ',
        modelId: AI_MODELS.SEEDANCE_25,
        adapterType: AI_ADAPTER_TYPES.FAL,
      }),
    ).toBe('auto')
  })

  it('reads a unit-suffixed value the way the slider displays it', () => {
    // 助手的 prompt 计划把 LLM 写的 `'12s'` 原样落库，VideoComposer 用 parseFloat
    // 把它按 12 秒显示。发送端必须同口径，否则又是「看到的和发出去的不一样」。
    expect(
      resolveNodeVideoDuration({
        raw: '12s',
        modelId: AI_MODELS.SEEDANCE_25,
        adapterType: AI_ADAPTER_TYPES.FAL,
      }),
    ).toBe(12)
  })

  it('falls back to undefined for empty / non-string / unparsable values', () => {
    for (const raw of ['', '   ', 'soon', undefined, null, 30, {}]) {
      expect(
        resolveNodeVideoDuration({
          raw,
          modelId: AI_MODELS.SEEDANCE_25,
          adapterType: AI_ADAPTER_TYPES.FAL,
        }),
      ).toBeUndefined()
    }
  })

  it('sends nothing when the node has no model yet', () => {
    expect(
      resolveNodeVideoDuration({ raw: '30', modelId: undefined }),
    ).toBeUndefined()
  })
})
