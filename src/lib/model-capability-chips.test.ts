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

  // 火山 / BytePlus 的 5.0 Pro：透明底是一颗 select chip，且**必须**标成依赖
  // 参考图 —— 文档写死「仅支持图生图场景」。它和 inputFidelity 不同，不能靠
  // 「这个能力键天生依赖参考图」实现：同一个 `background` 键在 OpenAI 上文生图
  // 也能用，所以依赖关系只能由能力表逐模型声明。
  it.each([
    [AI_ADAPTER_TYPES.VOLCENGINE, AI_MODELS.SEEDREAM_50_PRO_VOLCENGINE],
    [AI_ADAPTER_TYPES.BYTEPLUS, AI_MODELS.SEEDREAM_50_PRO_BYTEPLUS],
  ])('grows a reference-gated background chip on %s %s', (adapter, id) => {
    // seed / resolution / imageAnalysis 声明在能力表里但不进这条 chip 行
    // （seed 归规格 chip 的「更多」，后两者不是用户可配项）。
    expect(capabilitiesOf(adapter, id)).toEqual([
      'guidanceScale',
      'background',
      'layerDecomposition',
    ])
    const chip = getModelCapabilityChips(adapter, id).find(
      (entry) => entry.capability === 'background',
    )
    expect(chip?.kind).toBe('select')
    expect(chip?.options).toEqual(['opaque', 'transparent'])
    expect(chip?.defaultValue).toBe('opaque')
    expect(chip?.requiresReferenceImage).toBe(true)
  })

  // 同一颗键在 OpenAI 上**不**依赖参考图 —— 回归护栏，防止有人把 background
  // 直接塞进全局的 REFERENCE_DEPENDENT_CAPABILITIES 图省事。
  it('keeps the OpenAI background chip usable without a reference', () => {
    const chip = getModelCapabilityChips(
      AI_ADAPTER_TYPES.OPENAI,
      AI_MODELS.OPENAI_GPT_IMAGE_2,
    ).find((entry) => entry.capability === 'background')
    expect(chip?.requiresReferenceImage).toBe(false)
  })

  // fal 那条 5.0 Pro 与两条 Lite 都没有这个字段，chip 不能长出来。
  it.each([
    [AI_ADAPTER_TYPES.FAL, AI_MODELS.SEEDREAM_50_PRO],
    [AI_ADAPTER_TYPES.VOLCENGINE, AI_MODELS.SEEDREAM_50_LITE_VOLCENGINE],
    [AI_ADAPTER_TYPES.BYTEPLUS, AI_MODELS.SEEDREAM_50_LITE_BYTEPLUS],
  ])('keeps the background chip off %s %s', (adapter, id) => {
    expect(capabilitiesOf(adapter, id)).not.toContain('background')
  })

  // 从 5.0 Pro 切到 Lite 时透明底必须跟着走，否则一个 provider 不收的字段会
  // 留在 advancedParams 里被原样发出去。
  it('drops a transparent background when the target model cannot take it', () => {
    expect(
      pruneIncompatibleCapabilityValues(
        { background: 'transparent' },
        AI_ADAPTER_TYPES.VOLCENGINE,
        AI_MODELS.SEEDREAM_50_LITE_VOLCENGINE,
      ),
    ).toEqual({})
    expect(
      pruneIncompatibleCapabilityValues(
        { background: 'transparent' },
        AI_ADAPTER_TYPES.VOLCENGINE,
        AI_MODELS.SEEDREAM_50_PRO_VOLCENGINE,
      ),
    ).toBeNull()
  })

  // 图层拆分是一颗 toggle，且同样被参考图闸住 —— 开关型 chip 此前把
  // requiresReferenceImage 写死成 false，那会让用户在没挂图时点得动它。
  it.each([
    [AI_ADAPTER_TYPES.VOLCENGINE, AI_MODELS.SEEDREAM_50_PRO_VOLCENGINE],
    [AI_ADAPTER_TYPES.BYTEPLUS, AI_MODELS.SEEDREAM_50_PRO_BYTEPLUS],
  ])('grows a reference-gated layer toggle on %s %s', (adapter, id) => {
    const chip = getModelCapabilityChips(adapter, id).find(
      (entry) => entry.capability === 'layerDecomposition',
    )
    expect(chip?.kind).toBe('toggle')
    expect(chip?.defaultValue).toBe(false)
    expect(chip?.requiresReferenceImage).toBe(true)
  })

  // preview 是另一颗 toggle，它**不**依赖参考图 —— 回归护栏。
  it('keeps the OpenAI preview toggle usable without a reference', () => {
    const chip = getModelCapabilityChips(
      AI_ADAPTER_TYPES.OPENAI,
      AI_MODELS.OPENAI_GPT_IMAGE_2,
    ).find((entry) => entry.capability === 'preview')
    expect(chip?.kind).toBe('toggle')
    expect(chip?.requiresReferenceImage).toBe(false)
  })

  // 切到不认它的模型时这颗 toggle 必须被丢掉。此前 prune 的 toggle 名单是硬写
  // 的 `['preview']`，新 toggle 会静默留在 params 里被原样发出去。
  it('drops layer decomposition when the target model cannot take it', () => {
    expect(
      pruneIncompatibleCapabilityValues(
        { layerDecomposition: true },
        AI_ADAPTER_TYPES.VOLCENGINE,
        AI_MODELS.SEEDREAM_50_LITE_VOLCENGINE,
      ),
    ).toEqual({})
    expect(
      pruneIncompatibleCapabilityValues(
        { layerDecomposition: true },
        AI_ADAPTER_TYPES.VOLCENGINE,
        AI_MODELS.SEEDREAM_50_PRO_VOLCENGINE,
      ),
    ).toBeNull()
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

/**
 * PixAI 的专属旋钮（2026-09-20 官方 createImage 页核实）。起因：只选 Tsubaki.2
 * 时右列整个空白 —— 能力表当时只给它声明了 `negativePrompt` + `seed`。
 */
describe('PixAI capability chips', () => {
  // `mode` 官方原文：「Only available for the Tsubaki.2 and Tsubaki.3 model
  // families. Rejected with 400 INVALID_ARGUMENT on other model types.」
  it('gives Tsubaki the render mode and the output size', () => {
    expect(
      capabilitiesOf(AI_ADAPTER_TYPES.PIXAI, AI_MODELS.PIXAI_TSUBAKI_2),
    ).toEqual(['pixaiSize', 'pixaiMode'])
  })

  // SDXL 两档是 DiT 之外的那支：收扩散旋钮，⛔ 不收 mode。
  it.each([AI_MODELS.PIXAI_HARUKA_V2, AI_MODELS.PIXAI_HOSHINO_V2])(
    'gives %s the diffusion knobs and the output size, but no render mode',
    (modelId) => {
      expect(capabilitiesOf(AI_ADAPTER_TYPES.PIXAI, modelId)).toEqual([
        'guidanceScale',
        'steps',
        'pixaiSize',
      ])
    },
  )

  it.each([
    ['pixaiMode', ['lite', 'standard', 'pro', 'ultra']],
    ['pixaiSize', ['1k', '1.5k']],
  ])('derives %s from the documented value set', (cap, options) => {
    const chip = getModelCapabilityChips(
      AI_ADAPTER_TYPES.PIXAI,
      AI_MODELS.PIXAI_TSUBAKI_2,
    ).find((entry) => entry.capability === cap)
    expect(chip?.kind).toBe('select')
    expect(chip?.options).toEqual(options)
  })

  // ⛔ 两家的键不串台：换到 NAI 时 PixAI 的专属值整个丢掉，反之亦然。
  it('drops PixAI-only values when switching to NovelAI', () => {
    expect(
      pruneIncompatibleCapabilityValues(
        { pixaiMode: 'ultra', pixaiSize: '1.5k', ucPreset: 'heavy' },
        AI_ADAPTER_TYPES.NOVELAI,
        AI_MODELS.NOVELAI_V5_FULL,
      ),
    ).toEqual({ ucPreset: 'heavy' })
  })

  it('drops the render mode when switching from Tsubaki to an SDXL model', () => {
    expect(
      pruneIncompatibleCapabilityValues(
        { pixaiMode: 'ultra', pixaiSize: '1.5k' },
        AI_ADAPTER_TYPES.PIXAI,
        AI_MODELS.PIXAI_HARUKA_V2,
      ),
    ).toEqual({ pixaiSize: '1.5k' })
  })
})

describe('NovelAI capability chips', () => {
  // 11 的派生层：模型声明什么字段，chip 行就长什么控件。质量标签与 `Text:` 是
  // V5 专属（官方 qualitytags / textrendering 两页都只写 V5），V4.5 只该拿到
  // UC 预设那一颗。
  it('gives V5 the quality tag, UC preset and Text controls', () => {
    expect(
      capabilitiesOf(AI_ADAPTER_TYPES.NOVELAI, AI_MODELS.NOVELAI_V5_FULL),
    ).toEqual([
      'guidanceScale',
      'steps',
      'referenceStrength',
      'ucPreset',
      'sampler',
      'qualityToggle',
      'textRendering',
    ])
  })

  // 采样器不分代（官方 sampling 页没有按模型分档），所以 V4.5 也有它；
  // V5 专属的只有质量标签与 `Text:`。
  it('gives V4.5 the UC preset and the sampler, but no V5-only control', () => {
    expect(
      capabilitiesOf(AI_ADAPTER_TYPES.NOVELAI, AI_MODELS.NOVELAI_V45_FULL),
    ).toEqual([
      'guidanceScale',
      'steps',
      'referenceStrength',
      'ucPreset',
      'sampler',
    ])
  })

  it.each([
    ['qualityToggle', 'off'],
    ['ucPreset', 'none'],
    // 采样器的缺省必须是 worker 此前硬编的那一档 —— 停在缺省上逐字保住旧行为。
    ['sampler', 'k_euler_ancestral'],
  ])('defaults %s to the no-op option so the chip idles', (cap, expected) => {
    const chip = getModelCapabilityChips(
      AI_ADAPTER_TYPES.NOVELAI,
      AI_MODELS.NOVELAI_V5_FULL,
    ).find((entry) => entry.capability === cap)
    expect(chip?.kind).toBe('select')
    expect(chip?.options?.[0]).toBe(expected)
    expect(chip?.defaultValue).toBe(expected)
    expect(isCapabilityChipSet(chip!, {})).toBe(false)
  })

  // 两档不同上限（官方文字页 / 模型页：Full 750、Curated 374）。
  it.each([
    [AI_MODELS.NOVELAI_V5_FULL, 750],
    [AI_MODELS.NOVELAI_V5_CURATED, 374],
  ])('derives the Text control for %s with its own cap', (id, maxLength) => {
    const chip = getModelCapabilityChips(AI_ADAPTER_TYPES.NOVELAI, id).find(
      (entry) => entry.capability === 'textRendering',
    )
    expect(chip?.kind).toBe('text')
    expect(chip?.maxLength).toBe(maxLength)
    expect(chip?.defaultValue).toBe('')
  })

  it('drops V5-only values when switching to V4.5', () => {
    expect(
      pruneIncompatibleCapabilityValues(
        {
          qualityToggle: 'standard',
          textRendering: 'hello',
          ucPreset: 'heavy',
        },
        AI_ADAPTER_TYPES.NOVELAI,
        AI_MODELS.NOVELAI_V45_FULL,
      ),
    ).toEqual({ ucPreset: 'heavy' })
  })

  it('drops a Text value longer than the model cap', () => {
    expect(
      pruneIncompatibleCapabilityValues(
        { textRendering: 'x'.repeat(751) },
        AI_ADAPTER_TYPES.NOVELAI,
        AI_MODELS.NOVELAI_V5_FULL,
      ),
    ).toEqual({})
    expect(
      pruneIncompatibleCapabilityValues(
        { textRendering: 'x'.repeat(750) },
        AI_ADAPTER_TYPES.NOVELAI,
        AI_MODELS.NOVELAI_V5_FULL,
      ),
    ).toBeNull()
  })
})
