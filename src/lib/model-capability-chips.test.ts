import { describe, expect, it } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  getModelCapabilityChips,
  isCapabilityChipSet,
  pruneIncompatibleCapabilityValues,
} from '@/lib/model-capability-chips'

const capabilitiesOf = (
  adapterType: AI_ADAPTER_TYPES,
  modelId?: string,
): string[] =>
  getModelCapabilityChips(adapterType, modelId).map((chip) => chip.capability)

describe('getModelCapabilityChips', () => {
  it('derives GPT Image chips from the capability table alone', () => {
    expect(
      capabilitiesOf(AI_ADAPTER_TYPES.OPENAI, AI_MODELS.OPENAI_GPT_IMAGE_2),
    ).toEqual(['quality', 'preview', 'background', 'style'])
  })

  // 2.5 的 override 是**整体替换**（不是合并），style 因此在这一档消失。
  // 输入保真（`input_fidelity`）只在这两档 2.5 上 —— gpt-image-2 的官方指引明说
  // 「omit this parameter」，所以它下面那条断言是闸不是凑数。
  it.each([
    AI_MODELS.OPENAI_GPT_IMAGE_25_FLARE,
    AI_MODELS.OPENAI_GPT_IMAGE_25_SUNBURST,
  ])('follows a per-model override instead of the adapter default', (id) => {
    expect(capabilitiesOf(AI_ADAPTER_TYPES.OPENAI, id)).toEqual([
      'quality',
      'inputFidelity',
      'preview',
      'background',
    ])
  })

  it('offers input fidelity only where the provider accepts it', () => {
    const chip = getModelCapabilityChips(
      AI_ADAPTER_TYPES.OPENAI,
      AI_MODELS.OPENAI_GPT_IMAGE_25_SUNBURST,
    ).find((entry) => entry.capability === 'inputFidelity')
    expect(chip?.kind).toBe('select')
    // 没有 `auto` —— 官方 reference 只给 high / low，不设就是不发。
    expect(chip?.options).toEqual(['low', 'high'])
    expect(chip?.defaultValue).toBe('low')
    // `/v1/images/edits` 专属字段，纯文生图那条路上发过去是 400。
    expect(chip?.requiresReferenceImage).toBe(true)

    expect(
      capabilitiesOf(AI_ADAPTER_TYPES.OPENAI, AI_MODELS.OPENAI_GPT_IMAGE_2),
    ).not.toContain('inputFidelity')
    expect(capabilitiesOf(AI_ADAPTER_TYPES.OPENAI)).not.toContain(
      'inputFidelity',
    )
  })

  // 没有专属能力 = 宿主整段（虚线 + 小标 + chip 行）不渲染。
  //
  // ⚠ 这三家的空是**核过一手 schema 的结论**，不是还没接（第 61 项，2026-09-18）：
  // - Gemini `generateContent` 的 imageConfig 只有 aspectRatio / imageSize；
  //   对话式改图是会话历史、多图融合是多塞几个 part、角色/物体槽是文档上的
  //   条数上限（≤5 人 / ≤6 物），三者都没有请求字段。
  // - fal `fal-ai/flux-2-pro{,/edit}` 只有 prompt / image_size / image_urls /
  //   seed / output_format / safety_tolerance / enable_safety_checker ——
  //   没有图层，也没有 JSON prompt 开关（JSON 是写进 prompt 的写法）。
  // - fal `bytedance/seedream/v5/pro/*` 没有 sequential_image_generation；火山
  //   Ark 更是明写 5.0 pro「暂不支持组图生成、联网搜索」。
  it('returns nothing for models whose only capabilities are generic', () => {
    expect(
      capabilitiesOf(AI_ADAPTER_TYPES.GEMINI, AI_MODELS.GEMINI_PRO_IMAGE),
    ).toEqual([])
    expect(
      capabilitiesOf(AI_ADAPTER_TYPES.FAL, AI_MODELS.SEEDREAM_50_PRO),
    ).toEqual([])
    expect(capabilitiesOf(AI_ADAPTER_TYPES.FAL, AI_MODELS.FLUX_2_PRO)).toEqual(
      [],
    )
  })

  // seed / 负面提示词 / LoRA 不是这条 chip 行的事（seed 进第 12 项的规格
  // 「更多」，UC 拆去 D2b，LoRA 只在 LoRA 工作台）。
  it('never derives seed, negative prompt or LoRA chips', () => {
    const caps = capabilitiesOf(AI_ADAPTER_TYPES.FAL, AI_MODELS.FLUX_LORA)
    expect(caps).not.toContain('seed')
    expect(caps).not.toContain('negativePrompt')
    expect(caps).not.toContain('lora')
    expect(caps).toEqual(['guidanceScale', 'steps', 'referenceStrength'])
  })

  it('marks referenceStrength as needing a reference image', () => {
    const chip = getModelCapabilityChips(
      AI_ADAPTER_TYPES.FAL,
      AI_MODELS.FLUX_LORA,
    ).find((entry) => entry.capability === 'referenceStrength')
    expect(chip?.requiresReferenceImage).toBe(true)
    expect(chip?.kind).toBe('slider')
  })

  it('ignores adapters that are not in the capability table', () => {
    expect(
      getModelCapabilityChips('not-an-adapter' as AI_ADAPTER_TYPES),
    ).toEqual([])
    expect(getModelCapabilityChips(undefined)).toEqual([])
  })
})

describe('isCapabilityChipSet', () => {
  it('treats the capability default as the idle state', () => {
    const [quality] = getModelCapabilityChips(
      AI_ADAPTER_TYPES.OPENAI,
      AI_MODELS.OPENAI_GPT_IMAGE_2,
    )
    expect(isCapabilityChipSet(quality, {})).toBe(false)
    expect(isCapabilityChipSet(quality, { quality: 'auto' })).toBe(false)
    expect(isCapabilityChipSet(quality, { quality: 'high' })).toBe(true)
  })
})

describe('pruneIncompatibleCapabilityValues', () => {
  // 通用值（提示词 · 参考轨 · 规格 · 张数）原样保留，专属值静默回默认。
  it('drops model-specific values the new model cannot take, keeping generic ones', () => {
    const next = pruneIncompatibleCapabilityValues(
      {
        prompt: undefined,
        quality: 'max',
        background: 'transparent',
        resolution: '2K',
        seed: 42,
        negativePrompt: 'blurry',
      } as never,
      AI_ADAPTER_TYPES.FAL,
      AI_MODELS.SEEDREAM_50_PRO,
    )
    expect(next).toEqual({
      prompt: undefined,
      resolution: '2K',
      seed: 42,
      negativePrompt: 'blurry',
    })
  })

  // 切到不认输入保真的型号（gpt-image-2）时，这个键必须跟着走。
  it('drops input fidelity when the target model cannot take it', () => {
    expect(
      pruneIncompatibleCapabilityValues(
        { inputFidelity: 'high' },
        AI_ADAPTER_TYPES.OPENAI,
        AI_MODELS.OPENAI_GPT_IMAGE_2,
      ),
    ).toEqual({})
    expect(
      pruneIncompatibleCapabilityValues(
        { inputFidelity: 'high' },
        AI_ADAPTER_TYPES.OPENAI,
        AI_MODELS.OPENAI_GPT_IMAGE_25_FLARE,
      ),
    ).toBeNull()
  })

  it('drops a quality tier the target model does not declare', () => {
    expect(
      pruneIncompatibleCapabilityValues(
        { quality: 'max' },
        AI_ADAPTER_TYPES.OPENAI,
        AI_MODELS.OPENAI_GPT_IMAGE_2,
      ),
    ).toEqual({})
  })

  it('keeps a value the target model still supports', () => {
    expect(
      pruneIncompatibleCapabilityValues(
        { quality: 'high', background: 'transparent' },
        AI_ADAPTER_TYPES.OPENAI,
        AI_MODELS.OPENAI_GPT_IMAGE_2,
      ),
    ).toBeNull()
  })

  // ⚠ 没有变化必须返回 null —— 宿主的 effect 依赖里就有 advancedParams，
  // 每次都还一个新对象会把它打成死循环。
  it('returns null when nothing changes', () => {
    expect(
      pruneIncompatibleCapabilityValues(
        { resolution: '2K' },
        AI_ADAPTER_TYPES.GEMINI,
        AI_MODELS.GEMINI_PRO_IMAGE,
      ),
    ).toBeNull()
  })

  it('drops a slider value outside the new model range', () => {
    expect(
      pruneIncompatibleCapabilityValues(
        { guidanceScale: 18 },
        AI_ADAPTER_TYPES.FAL,
        AI_MODELS.FLUX_2_FLASH,
      ),
    ).toBeNull()
    expect(
      pruneIncompatibleCapabilityValues(
        { guidanceScale: 18 },
        AI_ADAPTER_TYPES.VOLCENGINE,
      ),
    ).toEqual({})
  })
})
