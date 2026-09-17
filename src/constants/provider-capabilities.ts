import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { AI_MODELS } from '@/constants/models'

/**
 * Provider capability flags.
 * Each flag indicates a parameter that can be user-configured for a given adapter.
 * UI components use these to show/hide controls dynamically.
 */
export type ProviderCapability =
  | 'negativePrompt'
  | 'guidanceScale'
  | 'steps'
  | 'seed'
  | 'referenceStrength'
  | 'quality'
  | 'resolution'
  | 'background'
  | 'style'
  | 'imageAnalysis'
  | 'lora'
  | 'voiceSelection'
  | 'speed'
  | 'sampleRate'

/**
 * How the adapter handles reference images:
 * - 'native': Model natively understands "keep this character, change the scene" (OpenAI, Gemini)
 * - 'img2img': Model treats reference as base image to modify / style transfer (fal.ai Flux, Recraft, SD, NovelAI)
 * - 'director': Specialized character-reference system. Unused in production after
 *   NovelAI V5 launch (no Precise Reference) and the V4.5 Director worker gap.
 */
export type ReferenceImageMode = 'native' | 'img2img' | 'director'

/**
 * OpenAI's `POST /v1/images/edits` accepts up to 16 input images for the
 * gpt-image family (each png/webp/jpg under 50MB).
 * https://developers.openai.com/api/reference/resources/images/methods/edit
 */
export const OPENAI_GPT_IMAGE_MAX_REFERENCE_IMAGES = 16

/**
 * 火山 Ark / BytePlus Seedream 参考图默认上限。Ark 文档 2026-09-17 核实：
 * Seedream 4.0 / 4.5 / 5.0 Lite 最多 14 张参考图，**5.0 Pro 只收 10 张**。
 * Pro 的差异由 MODEL_CAPABILITY_OVERRIDES 逐模型下调，不动这个默认值。
 * https://www.volcengine.com/docs/82379/1541523
 */
export const VOLCENGINE_SEEDREAM_MAX_REFERENCE_IMAGES = 14
/**
 * fal Seedream 5.0 Pro/Lite `/edit`: "Up to 10 images are supported; if more
 * are sent, only the last 10 are used."
 * https://fal.ai/models/bytedance/seedream/v5/pro/edit
 */
export const FAL_SEEDREAM_MAX_REFERENCE_IMAGES = 10
/**
 * FLUX.2 [pro] official API cap is 8 reference images (BFL / Azure Foundry).
 * fal OpenAPI for `fal-ai/flux-2-pro/edit` has no maxItems.
 */
export const FAL_FLUX_2_PRO_MAX_REFERENCE_IMAGES = 8
/**
 * `fal-ai/flux-2/flash/edit`: "A maximum of 4 images are allowed, if more are
 * provided, only the first 4 will be used."
 */
export const FAL_FLUX_2_FLASH_MAX_REFERENCE_IMAGES = 4
export const FAL_KLING_V3_ELEMENT_REFERENCE_IMAGES_MAX = 3
export const FAL_KLING_V3_MAX_REFERENCE_IMAGES =
  1 + FAL_KLING_V3_ELEMENT_REFERENCE_IMAGES_MAX

/** Range constraints for numeric parameters */
export interface NumericRange {
  min: number
  max: number
  step: number
  default: number
}

/** Configuration for each capability, including default ranges */
export interface CapabilityConfig {
  capabilities: readonly ProviderCapability[]
  guidanceScale?: NumericRange
  steps?: NumericRange
  referenceStrength?: NumericRange
  loraScale?: NumericRange
  qualityOptions?: readonly string[]
  /** Resolution tiers the model accepts (e.g. 'auto' | '1K' | '2K' | '4K') */
  resolutionOptions?: readonly string[]
  styleOptions?: readonly string[]
  backgroundOptions?: readonly string[]
  /** Maximum number of LoRAs that can be applied simultaneously */
  maxLoras?: number
  /** Maximum number of reference images supported (default: 1) */
  maxReferenceImages?: number
  /** How this adapter handles reference images (default: 'img2img') */
  referenceImageMode?: ReferenceImageMode
}

export const ADAPTER_CAPABILITIES: Record<AI_ADAPTER_TYPES, CapabilityConfig> =
  {
    [AI_ADAPTER_TYPES.NOVELAI]: {
      capabilities: [
        'negativePrompt',
        'guidanceScale',
        'steps',
        'seed',
        'referenceStrength',
        // NovelAI does not support image analysis (reverse engineering)
      ],
      guidanceScale: { min: 1, max: 20, step: 0.5, default: 5 },
      steps: { min: 1, max: 50, step: 1, default: 28 },
      referenceStrength: { min: 0.01, max: 0.99, step: 0.01, default: 0.7 },
      maxReferenceImages: 1,
      // Production worker treats a single reference as img2img. V5 launch has
      // no Director / Precise Reference; V4.5 Director is not worker-migrated.
      referenceImageMode: 'img2img',
    },

    [AI_ADAPTER_TYPES.FAL]: {
      capabilities: [
        'negativePrompt',
        'guidanceScale',
        'steps',
        'seed',
        'referenceStrength',
        'imageAnalysis',
        'lora',
      ],
      guidanceScale: { min: 1, max: 20, step: 0.5, default: 3.5 },
      steps: { min: 1, max: 50, step: 1, default: 28 },
      referenceStrength: { min: 0.01, max: 0.99, step: 0.01, default: 0.7 },
      loraScale: { min: 0.1, max: 2, step: 0.05, default: 1 },
      maxLoras: 5,
      maxReferenceImages: 1,
      referenceImageMode: 'img2img',
    },

    // Retired (gen4.5 adapter deleted, no reachable models) — kept as an
    // empty entry because the enum member stays. See DEEPSEEK/DASHSCOPE/
    // ANTHROPIC/XAI below for the same "no image-generation controls" shape.
    [AI_ADAPTER_TYPES.RUNWAY]: {
      capabilities: [],
    },

    [AI_ADAPTER_TYPES.HUGGINGFACE]: {
      capabilities: [
        'negativePrompt',
        'guidanceScale',
        'steps',
        'seed',
        'imageAnalysis',
      ],
      guidanceScale: { min: 1, max: 20, step: 0.5, default: 7.5 },
      steps: { min: 1, max: 50, step: 1, default: 30 },
      maxReferenceImages: 1,
    },

    [AI_ADAPTER_TYPES.REPLICATE]: {
      capabilities: [
        'negativePrompt',
        'guidanceScale',
        'steps',
        'seed',
        'imageAnalysis',
        'lora',
      ],
      guidanceScale: { min: 1, max: 20, step: 0.5, default: 7.5 },
      steps: { min: 1, max: 50, step: 1, default: 28 },
      loraScale: { min: 0.1, max: 2, step: 0.05, default: 1 },
      // 2026-08-07 核实（Replicate 公开 schema 页）：唯一还在跑的 Replicate LoRA
      // 路线是 ILLUSTRIOUS_XL → `delta-lock/noobai-xl`，它的 `loras` 入参是一个
      // **不限长度**的列表（`"URL:Strength,URL:Strength,…"` 或 JSON list dumped
      // as string），schema 里没有任何数量上限。另一条 Replicate LoRA 路线
      // ANIMA_PENCIL_XL 已 available:false（`lucataco/animapencil-xl-v4` 端点 404）。
      // 旧值 2 是 2026-03 随首版 LoRA 支持写进来的、无注释无依据的保守数。
      //
      // ⚠ 这个数**不是 provider 的真实上限——真实上限是「没有」**。它现在只剩
      // **一个**读者：`CapabilityForm` 的「加号还能不能按」UI 闸。没有任何一条链路
      // 再拿它截断发出去的载荷。
      // 已按 owner 2026-08-07「一把尺子也不要了」退役掉的：LoRA 装配台、卡片配方
      // 编译（H，eb295d23 / 6c3add69）、画布两条 generate 路径的
      // `.slice(0, maxLoras)`（J4，f9522e44）。
      // M（2026-08-07）退役了最后一个读它的画布件 `CharacterImageLoraControls`
      // 的加号闸——开工后查出该组件自 `04f8f6be`（08-05）起零渲染，owner 拍板
      // 「角色图不要 LoRA 能力」，组件整体删除，画布侧不再有任何 LoRA 入口。
      maxLoras: 3,
      maxReferenceImages: 1,
    },

    [AI_ADAPTER_TYPES.OPENAI]: {
      capabilities: [
        'quality',
        'resolution',
        'background',
        'style',
        'imageAnalysis',
      ],
      qualityOptions: ['auto', 'low', 'medium', 'high'],
      resolutionOptions: ['auto', '1K', '2K', '4K'],
      backgroundOptions: ['auto', 'transparent', 'opaque'],
      styleOptions: ['vivid', 'natural'],
      maxReferenceImages: 1,
      referenceImageMode: 'native',
    },

    [AI_ADAPTER_TYPES.DEEPSEEK]: {
      capabilities: [],
    },

    [AI_ADAPTER_TYPES.GEMINI]: {
      capabilities: ['resolution', 'imageAnalysis'],
      resolutionOptions: ['1K', '2K', '4K'],
      // Gemini 3 Pro Image accepts at most 14 images per prompt (of which ≤6
      // object and ≤5 human references).
      // https://ai.google.dev/gemini-api/docs/models/gemini-3-pro-image
      maxReferenceImages: 14,
      referenceImageMode: 'native',
    },

    [AI_ADAPTER_TYPES.VOLCENGINE]: {
      capabilities: ['seed', 'guidanceScale', 'resolution', 'imageAnalysis'],
      guidanceScale: { min: 1, max: 10, step: 0.5, default: 8.0 },
      resolutionOptions: ['2K', '4K'],
      maxReferenceImages: VOLCENGINE_SEEDREAM_MAX_REFERENCE_IMAGES,
      referenceImageMode: 'native',
    },

    // BytePlus ModelArk = 火山 Ark's international station serving the same
    // image API, so the image parameter surface must mirror VOLCENGINE above.
    // ⚠ Was `capabilities: []` while this route was video-only; leaving it
    // empty once Seedream landed here would silently strip seed / guidance /
    // resolution controls and drop maxReferenceImages to the conservative
    // adapter floor for every BytePlus image model.
    [AI_ADAPTER_TYPES.BYTEPLUS]: {
      capabilities: ['seed', 'guidanceScale', 'resolution', 'imageAnalysis'],
      guidanceScale: { min: 1, max: 10, step: 0.5, default: 8.0 },
      resolutionOptions: ['2K', '4K'],
      maxReferenceImages: VOLCENGINE_SEEDREAM_MAX_REFERENCE_IMAGES,
      referenceImageMode: 'native',
    },

    // Video-only route. This table drives the **image** parameter controls, and
    // H3 generates no images — hence empty, same as the LLM-only lines below.
    [AI_ADAPTER_TYPES.MINIMAX]: {
      capabilities: [],
    },
    [AI_ADAPTER_TYPES.MINIMAX_CN]: {
      capabilities: [],
    },

    [AI_ADAPTER_TYPES.FISH_AUDIO]: {
      capabilities: ['voiceSelection', 'speed', 'sampleRate'],
    },

    [AI_ADAPTER_TYPES.ELEVENLABS]: {
      capabilities: ['voiceSelection', 'speed'],
    },

    [AI_ADAPTER_TYPES.DASHSCOPE]: {
      // Text/vision LLM line — no image-generation parameter controls.
      capabilities: [],
    },

    [AI_ADAPTER_TYPES.ANTHROPIC]: {
      // Text-only LLM line (canvas assistant) — no image-generation
      // parameter controls.
      capabilities: [],
    },

    [AI_ADAPTER_TYPES.XAI]: {
      // Grok is a text/vision LLM line here — it reads images but never
      // generates them, so no image-generation parameter controls.
      capabilities: [],
    },

    [AI_ADAPTER_TYPES.HYPER3D_RODIN]: {
      capabilities: ['seed'] as const,
      maxReferenceImages: 5,
      referenceImageMode: 'native' as const,
    },

    [AI_ADAPTER_TYPES.RUNNER]: {
      capabilities: [
        'negativePrompt',
        'guidanceScale',
        'steps',
        'seed',
        'lora',
        'referenceStrength',
      ],
      guidanceScale: { min: 1, max: 15, step: 0.5, default: 7.5 },
      steps: { min: 1, max: 60, step: 1, default: 30 },
      loraScale: { min: 0.1, max: 2, step: 0.05, default: 1 },
      // v1 stock worker-comfyui can't download LoRAs at request time — only
      // pre-baked, allowlisted LoRAs are mountable (see runner-checkpoints.ts).
      maxLoras: 3,
      // img2img: one reference image, scaled to the target dimensions and
      // VAE-encoded into the KSampler latent (see workers/execution/src/models/
      // runner/workflow-builder.ts). referenceStrength inverts to denoise.
      referenceStrength: { min: 0.01, max: 0.99, step: 0.01, default: 0.7 },
      referenceImageMode: 'img2img',
      maxReferenceImages: 1,
    },
  }

// ─── Per-Model Capability Overrides ─────────────────────────────
// When a model needs different capabilities than its adapter default,
// add an entry keyed by model ID (AI_MODELS enum value).
// Only specified fields are overridden; unspecified fall through to adapter.

export const MODEL_CAPABILITY_OVERRIDES: Partial<
  Record<string, Partial<CapabilityConfig>>
> = {
  [AI_MODELS.NOVELAI_V5_FULL]: {
    guidanceScale: { min: 1, max: 20, step: 0.5, default: 7 },
    steps: { min: 1, max: 50, step: 1, default: 23 },
  },
  [AI_MODELS.NOVELAI_V5_CURATED]: {
    guidanceScale: { min: 1, max: 20, step: 0.5, default: 7 },
    steps: { min: 1, max: 50, step: 1, default: 23 },
  },
  [AI_MODELS.OPENAI_GPT_IMAGE_2]: {
    maxReferenceImages: OPENAI_GPT_IMAGE_MAX_REFERENCE_IMAGES,
  },
  [AI_MODELS.OPENAI_GPT_IMAGE_25_FLARE]: {
    capabilities: ['quality', 'resolution', 'background', 'imageAnalysis'],
    qualityOptions: ['auto', 'low', 'medium', 'high', 'xhigh', 'max'],
    maxReferenceImages: OPENAI_GPT_IMAGE_MAX_REFERENCE_IMAGES,
  },
  [AI_MODELS.OPENAI_GPT_IMAGE_25_SUNBURST]: {
    capabilities: ['quality', 'resolution', 'background', 'imageAnalysis'],
    qualityOptions: ['auto', 'low', 'medium', 'high', 'xhigh', 'max'],
    maxReferenceImages: OPENAI_GPT_IMAGE_MAX_REFERENCE_IMAGES,
  },
  [AI_MODELS.FLUX_2_PRO]: {
    // fal T2I endpoint ignores refs; worker swaps to `/edit` when any are
    // attached (same pattern as flux-lora → `/image-to-image`). `/edit` is
    // native multi-ref, not img2img denoising — drop referenceStrength.
    maxReferenceImages: FAL_FLUX_2_PRO_MAX_REFERENCE_IMAGES,
    referenceImageMode: 'native' as const,
    // fal OpenAPI (2026-09-17) for `fal-ai/flux-2-pro` and `/edit`: inputs are
    // prompt / image_size / (image_urls) / seed / output_format /
    // safety_tolerance / enable_safety_checker only. No negative_prompt, no
    // guidance_scale, no num_inference_steps and no `loras` — the worker used
    // to serialize those into a body fal simply drops, so the UI controls and
    // the LoRA badge were fake.
    capabilities: ['seed', 'imageAnalysis'] as const,
  },
  [AI_MODELS.FLUX_2_PRO_EDIT]: {
    maxReferenceImages: FAL_FLUX_2_PRO_MAX_REFERENCE_IMAGES,
    referenceImageMode: 'native' as const,
    capabilities: ['seed', 'imageAnalysis'] as const,
  },
  [AI_MODELS.SEEDREAM_45]: {
    maxReferenceImages: 0,
    // Seedream 4.5 (via fal) supports 2K/4K output on top of the generic FAL
    // capability set — kept as a full override (not a merge) since
    // resolveConfig() replaces `capabilities` wholesale rather than
    // concatenating with the adapter default.
    // fal OpenAPI (2026-09-17): `…/seedream/v4.5/text-to-image` takes only
    // prompt / image_size / num_images / max_images / seed / sync_mode /
    // enable_safety_checker — no negative_prompt, guidance_scale,
    // num_inference_steps or `loras`, so none of those are declared.
    capabilities: ['seed', 'imageAnalysis', 'resolution'] as const,
    resolutionOptions: ['2K', '4K'],
  },
  [AI_MODELS.SEEDREAM_50_PRO]: {
    maxReferenceImages: FAL_SEEDREAM_MAX_REFERENCE_IMAGES,
    referenceImageMode: 'native' as const,
    // Same shape as the 4.5 override — full replacement, not a merge, because
    // resolveConfig() swaps `capabilities` wholesale. 5.0 tops out at 2K
    // (pricing tiers are ≤1536² and ≤2048²), so no 4K option here.
    // fal OpenAPI (2026-09-17): `bytedance/seedream/v5/pro/*` takes only
    // prompt / image_size / (image_urls) / num_images / output_format /
    // sync_mode / enable_safety_checker — none of the diffusion knobs, no
    // `loras`, and not even `seed`.
    capabilities: ['imageAnalysis', 'resolution'] as const,
    resolutionOptions: ['2K'],
  },
  // Ark 文档 2026-09-17 核实：Seedream 5.0 Pro 的参考图上限是 10（Lite / 4.5 /
  // 4.0 才是 14）。只覆盖这一项，resolveConfig() 是浅合并，adapter 的
  // capabilities / resolutionOptions 原样保留。
  // https://www.volcengine.com/docs/82379/1541523
  [AI_MODELS.SEEDREAM_50_PRO_VOLCENGINE]: {
    maxReferenceImages: 10,
  },
  [AI_MODELS.SEEDREAM_50_PRO_BYTEPLUS]: {
    maxReferenceImages: 10,
  },
  [AI_MODELS.SEEDREAM_50_LITE]: {
    maxReferenceImages: FAL_SEEDREAM_MAX_REFERENCE_IMAGES,
    referenceImageMode: 'native' as const,
    // Same fal input surface as 5.0 Pro (checked 2026-09-17) — the generic FAL
    // adapter default would otherwise expose negativePrompt / guidanceScale /
    // steps / referenceStrength / lora that this endpoint does not accept.
    // `bytedance/seedream/v5/lite/{text-to-image,edit}` has no `seed` either.
    capabilities: ['imageAnalysis'] as const,
  },
  [AI_MODELS.IDEOGRAM_3]: {
    maxReferenceImages: 0,
  },
  [AI_MODELS.FLUX_2_FLASH]: {
    maxReferenceImages: FAL_FLUX_2_FLASH_MAX_REFERENCE_IMAGES,
    referenceImageMode: 'native' as const,
    // fal OpenAPI (2026-09-17) for `fal-ai/flux-2/flash` and `/edit`: unlike
    // FLUX.2 [pro] this endpoint really does accept `guidance_scale`
    // (0–20, default 2.5), but still no negative_prompt / num_inference_steps.
    capabilities: ['guidanceScale', 'seed', 'imageAnalysis', 'lora'] as const,
    guidanceScale: { min: 0, max: 20, step: 0.5, default: 2.5 },
  },
  [AI_MODELS.FLUX_LORA]: {
    // B9 (D6): reference-image img2img enabled. The FAL adapter default
    // already carries `referenceStrength` + `referenceImageMode: 'img2img'`;
    // flipping this to 1 lets the LoRA workbench surface the reference-image
    // chip. The fal adapter swaps `fal-ai/flux-lora` → the `/image-to-image`
    // endpoint when a reference image is present.
    maxReferenceImages: 1,
    // fal OpenAPI (2026-09-17) for `fal-ai/flux-lora` and `/image-to-image`:
    // guidance_scale / num_inference_steps / loras / seed / (strength) but no
    // negative_prompt, so the inherited FAL default's negativePrompt control
    // was fake. Everything else on that default is kept.
    capabilities: [
      'guidanceScale',
      'steps',
      'seed',
      'referenceStrength',
      'imageAnalysis',
      'lora',
    ] as const,
  },
  [AI_MODELS.RECRAFT_V4_PRO]: {
    maxReferenceImages: 0,
  },
  [AI_MODELS.FLUX_KONTEXT_MAX]: {
    // fal `kontext/max/multi` has no `loras` input (OpenAPI checked 2026-09-11).
    capabilities: ['seed'] as const,
    maxReferenceImages: 4,
    referenceImageMode: 'native' as const,
  },
  [AI_MODELS.ANIMA_PENCIL_XL]: {
    maxReferenceImages: 0,
  },
  [AI_MODELS.ILLUSTRIOUS_XL]: {
    maxReferenceImages: 0,
  },
  // 3D models: image-to-3D — only `seed` from the generic capability set
  // applies. Per-model 3D-specific params (textured_mesh, octree_resolution,
  // remove_background) live on the 3D Studio page directly.
  [AI_MODELS.HUNYUAN3D_2_1]: {
    capabilities: ['seed'] as const,
    maxReferenceImages: 1,
    referenceImageMode: 'native' as const,
  },
  [AI_MODELS.HUNYUAN3D_V3]: {
    capabilities: ['seed'] as const,
    maxReferenceImages: 4,
    referenceImageMode: 'native' as const,
  },
  [AI_MODELS.HUNYUAN3D_V31_PRO]: {
    capabilities: ['seed'] as const,
    maxReferenceImages: 8,
    referenceImageMode: 'native' as const,
  },
  [AI_MODELS.TRELLIS_2]: {
    capabilities: ['seed'] as const,
    maxReferenceImages: 1,
    referenceImageMode: 'native' as const,
  },
  [AI_MODELS.TRIPOSR]: {
    capabilities: ['seed'] as const,
    maxReferenceImages: 1,
    referenceImageMode: 'native' as const,
  },
  [AI_MODELS.RODIN_GEN_2_5]: {
    capabilities: ['seed'] as const,
    maxReferenceImages: 5,
    referenceImageMode: 'native' as const,
  },
  // Seedance 2.0 reference-to-video endpoints accept image_urls up to 9 per
  // fal docs (https://fal.ai/models/bytedance/seedance-2.0/reference-to-video).
  // Inheriting the FAL adapter default of 1 silently truncated multi-ref runs.
  [AI_MODELS.SEEDANCE_20_REFERENCE]: {
    maxReferenceImages: 9,
    referenceImageMode: 'native' as const,
  },
  [AI_MODELS.SEEDANCE_20_FAST_REFERENCE]: {
    maxReferenceImages: 9,
    referenceImageMode: 'native' as const,
  },
}

/** Resolve effective capability config: model override → adapter fallback */
function resolveConfig(
  adapterType: AI_ADAPTER_TYPES,
  modelId?: string,
): CapabilityConfig {
  const base = ADAPTER_CAPABILITIES[adapterType]
  if (!modelId) return base
  const override = MODEL_CAPABILITY_OVERRIDES[modelId]
  if (!override) return base
  return { ...base, ...override }
}

// ─── Capability → UI Field Type Mapping ──────────────────────────

/** Check whether a given adapter (optionally a specific model) supports a capability */
export function hasCapability(
  adapterType: AI_ADAPTER_TYPES,
  capability: ProviderCapability,
  modelId?: string,
): boolean {
  return resolveConfig(adapterType, modelId).capabilities.includes(capability)
}

/** Get the full capability config for an adapter, with optional model-level override */
export function getCapabilityConfig(
  adapterType: AI_ADAPTER_TYPES,
  modelId?: string,
): CapabilityConfig {
  return resolveConfig(adapterType, modelId)
}

/** Get the maximum number of reference images (default: 1), with optional model override */
export function getMaxReferenceImages(
  adapterType: AI_ADAPTER_TYPES,
  modelId?: string,
): number {
  return resolveConfig(adapterType, modelId).maxReferenceImages ?? 1
}

/** Get how reference images are handled (default: 'img2img'), with optional model override */
export function getReferenceImageMode(
  adapterType: AI_ADAPTER_TYPES,
  modelId?: string,
): ReferenceImageMode {
  return resolveConfig(adapterType, modelId).referenceImageMode ?? 'img2img'
}

export type CapabilityFieldType =
  | 'slider'
  | 'select'
  | 'textarea'
  | 'seed'
  | 'lora'

/** Map a user-configurable capability to its field type for data-driven rendering */
export function getCapabilityFieldType(
  cap: ProviderCapability,
): CapabilityFieldType | null {
  const map: Partial<Record<ProviderCapability, CapabilityFieldType>> = {
    negativePrompt: 'textarea',
    guidanceScale: 'slider',
    steps: 'slider',
    referenceStrength: 'slider',
    seed: 'seed',
    quality: 'select',
    background: 'select',
    style: 'select',
    lora: 'lora',
    // imageAnalysis is not user-configurable — no field type
  }
  return map[cap] ?? null
}
