import { describe, it, expect } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { AI_MODELS } from '@/constants/models'
import {
  ADAPTER_CAPABILITIES,
  getCapabilityConfig,
  getMaxReferenceImages,
  hasCapability,
} from '@/constants/provider-capabilities'

describe('provider-capabilities', () => {
  it.each([
    AI_MODELS.OPENAI_GPT_IMAGE_25_FLARE,
    AI_MODELS.OPENAI_GPT_IMAGE_25_SUNBURST,
  ])('exposes native editing and extended quality for %s', (modelId) => {
    const config = getCapabilityConfig(AI_ADAPTER_TYPES.OPENAI, modelId)
    expect(config.maxReferenceImages).toBe(16)
    expect(config.referenceImageMode).toBe('native')
    expect(config.qualityOptions).toEqual([
      'auto',
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
    ])
    expect(config.capabilities).not.toContain('style')
    expect(
      getCapabilityConfig(AI_ADAPTER_TYPES.OPENAI, AI_MODELS.OPENAI_GPT_IMAGE_2)
        .qualityOptions,
    ).not.toContain('max')
  })

  // `input_fidelity` is a 2.5-only field: the image-generation guide tells you
  // to omit it for gpt-image-2 (that model always runs inputs at high
  // fidelity), so it must not leak onto the adapter default or the older model.
  it.each([
    AI_MODELS.OPENAI_GPT_IMAGE_25_FLARE,
    AI_MODELS.OPENAI_GPT_IMAGE_25_SUNBURST,
  ])('offers low/high input fidelity for %s', (modelId) => {
    const config = getCapabilityConfig(AI_ADAPTER_TYPES.OPENAI, modelId)
    expect(config.capabilities).toContain('inputFidelity')
    expect(config.inputFidelityOptions).toEqual(['low', 'high'])
  })

  it('keeps input fidelity off gpt-image-2 and off the adapter default', () => {
    for (const config of [
      getCapabilityConfig(AI_ADAPTER_TYPES.OPENAI),
      getCapabilityConfig(
        AI_ADAPTER_TYPES.OPENAI,
        AI_MODELS.OPENAI_GPT_IMAGE_2,
      ),
    ]) {
      expect(config.capabilities).not.toContain('inputFidelity')
      expect(config.inputFidelityOptions).toBeUndefined()
    }
  })

  // 火山 Ark 的 `background` 是 5.0 Pro 专属（文档「模型支持」一栏只列它），
  // 所以这颗 chip 只能出现在两条原生线上——fal 那条 5.0 Pro 的入参里根本没有
  // 这个字段，Lite / 4.5 也没有。
  it.each([
    [AI_ADAPTER_TYPES.VOLCENGINE, AI_MODELS.SEEDREAM_50_PRO_VOLCENGINE],
    [AI_ADAPTER_TYPES.BYTEPLUS, AI_MODELS.SEEDREAM_50_PRO_BYTEPLUS],
  ])('offers a transparent background on %s %s', (adapterType, modelId) => {
    const config = getCapabilityConfig(adapterType, modelId)
    expect(config.capabilities).toContain('background')
    // `opaque` 必须排第一 —— chip 的缺省值取 options[0]，而文档的默认值是
    // opaque；排反了默认态就会变成「发 transparent」。
    expect(config.backgroundOptions).toEqual(['opaque', 'transparent'])
    expect(config.referenceDependentCapabilities).toContain('background')
    // 声明 capabilities 是整体替换，原有四项不能在这次覆盖里掉队。
    expect(config.capabilities).toEqual([
      'seed',
      'guidanceScale',
      'resolution',
      'imageAnalysis',
      'background',
      'layerDecomposition',
    ])
  })

  it.each([
    [AI_ADAPTER_TYPES.VOLCENGINE, undefined],
    [AI_ADAPTER_TYPES.BYTEPLUS, undefined],
    [AI_ADAPTER_TYPES.VOLCENGINE, AI_MODELS.SEEDREAM_50_LITE_VOLCENGINE],
    [AI_ADAPTER_TYPES.BYTEPLUS, AI_MODELS.SEEDREAM_50_LITE_BYTEPLUS],
    [AI_ADAPTER_TYPES.FAL, AI_MODELS.SEEDREAM_50_PRO],
  ])('keeps the transparent background off %s %s', (adapterType, modelId) => {
    const config = getCapabilityConfig(adapterType, modelId)
    expect(config.capabilities).not.toContain('background')
    expect(config.backgroundOptions).toBeUndefined()
  })

  // `layer_decomposition` 与 `background` 同档：文档「模型支持」只列 5.0 pro。
  // 两颗都依赖参考图，但**依赖的理由不同**（透明底要带 alpha 的输入，图层拆分
  // 要一张待拆分图），文档没说互斥，所以两者并列声明。
  it.each([
    [AI_ADAPTER_TYPES.VOLCENGINE, AI_MODELS.SEEDREAM_50_PRO_VOLCENGINE],
    [AI_ADAPTER_TYPES.BYTEPLUS, AI_MODELS.SEEDREAM_50_PRO_BYTEPLUS],
  ])('offers layer decomposition on %s %s', (adapterType, modelId) => {
    const config = getCapabilityConfig(adapterType, modelId)
    expect(config.capabilities).toContain('layerDecomposition')
    expect(config.referenceDependentCapabilities).toEqual([
      'background',
      'layerDecomposition',
    ])
  })

  it.each([
    [AI_ADAPTER_TYPES.VOLCENGINE, AI_MODELS.SEEDREAM_50_LITE_VOLCENGINE],
    [AI_ADAPTER_TYPES.BYTEPLUS, AI_MODELS.SEEDREAM_50_LITE_BYTEPLUS],
    [AI_ADAPTER_TYPES.FAL, AI_MODELS.SEEDREAM_50_PRO],
    [AI_ADAPTER_TYPES.OPENAI, AI_MODELS.OPENAI_GPT_IMAGE_25_FLARE],
  ])('keeps layer decomposition off %s %s', (adapterType, modelId) => {
    expect(
      getCapabilityConfig(adapterType, modelId).capabilities,
    ).not.toContain('layerDecomposition')
  })

  it('every AI_ADAPTER_TYPES entry has a capabilities config', () => {
    for (const adapterType of Object.values(AI_ADAPTER_TYPES)) {
      const config = ADAPTER_CAPABILITIES[adapterType]
      expect(
        config,
        `Missing capabilities config for ${adapterType}`,
      ).toBeDefined()
      expect(Array.isArray(config.capabilities)).toBe(true)
    }
  })

  it('getCapabilityConfig returns correct config for known adapter', () => {
    const config = getCapabilityConfig(AI_ADAPTER_TYPES.OPENAI)
    expect(config.capabilities).toContain('quality')
    expect(config.capabilities).toContain('background')
    expect(config.capabilities).toContain('style')
    expect(config.qualityOptions).toBeDefined()
  })

  it('hasCapability returns true for supported capabilities', () => {
    expect(hasCapability(AI_ADAPTER_TYPES.NOVELAI, 'negativePrompt')).toBe(true)
    expect(hasCapability(AI_ADAPTER_TYPES.NOVELAI, 'guidanceScale')).toBe(true)
    expect(hasCapability(AI_ADAPTER_TYPES.NOVELAI, 'steps')).toBe(true)
    expect(hasCapability(AI_ADAPTER_TYPES.NOVELAI, 'seed')).toBe(true)
    expect(hasCapability(AI_ADAPTER_TYPES.NOVELAI, 'referenceStrength')).toBe(
      true,
    )
  })

  it('hasCapability returns false for unsupported capabilities', () => {
    // Gemini has no capabilities
    expect(hasCapability(AI_ADAPTER_TYPES.GEMINI, 'negativePrompt')).toBe(false)
    expect(hasCapability(AI_ADAPTER_TYPES.GEMINI, 'guidanceScale')).toBe(false)
    // OpenAI doesn't support diffusion-specific params
    expect(hasCapability(AI_ADAPTER_TYPES.OPENAI, 'negativePrompt')).toBe(false)
    expect(hasCapability(AI_ADAPTER_TYPES.OPENAI, 'guidanceScale')).toBe(false)
    expect(hasCapability(AI_ADAPTER_TYPES.OPENAI, 'seed')).toBe(false)
  })

  it('numeric range configs have valid min < max and positive step', () => {
    for (const [adapterType, config] of Object.entries(ADAPTER_CAPABILITIES)) {
      for (const rangeName of [
        'guidanceScale',
        'steps',
        'referenceStrength',
      ] as const) {
        const range = config[rangeName]
        if (range) {
          expect(
            range.min,
            `${adapterType}.${rangeName}.min should be < max`,
          ).toBeLessThan(range.max)
          expect(
            range.step,
            `${adapterType}.${rangeName}.step should be > 0`,
          ).toBeGreaterThan(0)
          expect(
            range.default,
            `${adapterType}.${rangeName}.default should be >= min`,
          ).toBeGreaterThanOrEqual(range.min)
          expect(
            range.default,
            `${adapterType}.${rangeName}.default should be <= max`,
          ).toBeLessThanOrEqual(range.max)
        }
      }
    }
  })

  it('OpenAI option arrays are non-empty when declared', () => {
    const config = getCapabilityConfig(AI_ADAPTER_TYPES.OPENAI)
    expect(config.qualityOptions!.length).toBeGreaterThan(0)
    expect(config.backgroundOptions!.length).toBeGreaterThan(0)
    expect(config.styleOptions!.length).toBeGreaterThan(0)
  })

  // B9 (D6): FLUX LoRA reference-image img2img is enabled — the workbench
  // gates the reference chip on getMaxReferenceImages > 0, and the strength
  // slider on the inherited FAL referenceStrength range.
  it('FLUX LoRA accepts one reference image with an inherited strength range', () => {
    expect(
      getMaxReferenceImages(AI_ADAPTER_TYPES.FAL, AI_MODELS.FLUX_LORA),
    ).toBe(1)
    const config = getCapabilityConfig(
      AI_ADAPTER_TYPES.FAL,
      AI_MODELS.FLUX_LORA,
    )
    expect(config.referenceStrength).toBeDefined()
    expect(config.capabilities).toContain('referenceStrength')
  })

  // J4: the adapter default is a conservative floor, not a capability. Callers
  // that know their model MUST pass it — ArenaForm shipped without it and
  // collapsed GPT Image 2 from 16 reference images to 1, which additionally
  // turned the picker into a single-select input. This pins the gap so the
  // adapter-only reading can never look "good enough" again.
  it('resolves GPT Image 2 to its model cap, not the OPENAI adapter floor', () => {
    expect(getMaxReferenceImages(AI_ADAPTER_TYPES.OPENAI)).toBe(1)
    expect(
      getMaxReferenceImages(
        AI_ADAPTER_TYPES.OPENAI,
        AI_MODELS.OPENAI_GPT_IMAGE_2,
      ),
    ).toBe(16)
  })

  it('exposes fal edit-capable T2I models at their official reference caps', () => {
    expect(
      getMaxReferenceImages(AI_ADAPTER_TYPES.FAL, AI_MODELS.FLUX_2_PRO),
    ).toBe(8)
    expect(
      getMaxReferenceImages(AI_ADAPTER_TYPES.FAL, AI_MODELS.FLUX_2_PRO_EDIT),
    ).toBe(8)
    expect(
      getMaxReferenceImages(AI_ADAPTER_TYPES.FAL, AI_MODELS.FLUX_2_FLASH),
    ).toBe(4)
    expect(
      getMaxReferenceImages(AI_ADAPTER_TYPES.FAL, AI_MODELS.SEEDREAM_50_PRO),
    ).toBe(10)
    expect(
      getMaxReferenceImages(AI_ADAPTER_TYPES.FAL, AI_MODELS.SEEDREAM_50_LITE),
    ).toBe(10)
    expect(
      getMaxReferenceImages(AI_ADAPTER_TYPES.FAL, AI_MODELS.RECRAFT_V4_PRO),
    ).toBe(0)
  })

  // fal OpenAPI (2026-09-17): none of these endpoints declare a `loras` input,
  // yet the worker serializes `loras` into every fal image body — so a LoRA
  // badge here promised a mount fal silently drops.
  it.each([
    AI_MODELS.FLUX_2_PRO,
    AI_MODELS.FLUX_2_PRO_EDIT,
    AI_MODELS.SEEDREAM_45,
    AI_MODELS.SEEDREAM_50_PRO,
    AI_MODELS.SEEDREAM_50_LITE,
  ])('does not advertise LoRA on %s', (modelId) => {
    expect(hasCapability(AI_ADAPTER_TYPES.FAL, 'lora', modelId)).toBe(false)
  })

  // Neither `bytedance/seedream/v5/pro/*` nor `…/v5/lite/*` has a `seed` input.
  it.each([AI_MODELS.SEEDREAM_50_PRO, AI_MODELS.SEEDREAM_50_LITE])(
    'does not advertise seed on %s',
    (modelId) => {
      expect(hasCapability(AI_ADAPTER_TYPES.FAL, 'seed', modelId)).toBe(false)
    },
  )

  // `fal-ai/flux-lora` keeps guidance_scale / num_inference_steps / loras but
  // has no negative_prompt, unlike the generic FAL adapter default.
  it('keeps FLUX LoRA diffusion knobs but drops negativePrompt', () => {
    const caps = getCapabilityConfig(
      AI_ADAPTER_TYPES.FAL,
      AI_MODELS.FLUX_LORA,
    ).capabilities
    expect(caps).toContain('lora')
    expect(caps).toContain('guidanceScale')
    expect(caps).toContain('steps')
    expect(caps).not.toContain('negativePrompt')
  })
})
