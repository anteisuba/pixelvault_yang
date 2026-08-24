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
 * ⚠ UNVERIFIED (J4, 2026-08-07) — kept at its shipped value on purpose.
 *
 * No source was ever recorded for 14, and the 2026-08-07 sweep could not
 * confirm it: 火山's Seedream API reference is JS-rendered and did not resolve,
 * and the only figures reachable were for **Seedream 4.0** (≤10 reference
 * images, input+output ≤15) — a version this project does not ship. We run 4.5
 * and 5.0, so those numbers are a near-match, not evidence.
 *
 * Left alone rather than lowered: shrinking a cap on a near-match would break
 * working multi-reference runs to fix a problem nobody has observed. To settle
 * it, read the 4.5/5.0 API reference in a real browser (JS on), or submit 11+
 * references to a `*_VOLCENGINE` Seedream model and see whether 火山 400s.
 */
export const VOLCENGINE_SEEDREAM_MAX_REFERENCE_IMAGES = 14
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
      // 编译（H，eb295d23 / 6c3add69）、StudioNodeWorkbench 两条 generate 路径的
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

    [AI_ADAPTER_TYPES.BYTEPLUS]: {
      capabilities: [],
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
  [AI_MODELS.FLUX_2_PRO]: {
    maxReferenceImages: 0,
  },
  [AI_MODELS.SEEDREAM_45]: {
    maxReferenceImages: 0,
    // Seedream 4.5 (via fal) supports 2K/4K output on top of the generic FAL
    // capability set — kept as a full override (not a merge) since
    // resolveConfig() replaces `capabilities` wholesale rather than
    // concatenating with the adapter default.
    capabilities: [
      'negativePrompt',
      'guidanceScale',
      'steps',
      'seed',
      'imageAnalysis',
      'lora',
      'resolution',
    ] as const,
    resolutionOptions: ['2K', '4K'],
  },
  [AI_MODELS.SEEDREAM_50_PRO]: {
    maxReferenceImages: 0,
    // Same shape as the 4.5 override — full replacement, not a merge, because
    // resolveConfig() swaps `capabilities` wholesale. 5.0 tops out at 2K
    // (pricing tiers are ≤1536² and ≤2048²), so no 4K option here.
    capabilities: [
      'negativePrompt',
      'guidanceScale',
      'steps',
      'seed',
      'imageAnalysis',
      'lora',
      'resolution',
    ] as const,
    resolutionOptions: ['2K'],
  },
  [AI_MODELS.SEEDREAM_50_LITE]: {
    maxReferenceImages: 0,
  },
  [AI_MODELS.IDEOGRAM_3]: {
    maxReferenceImages: 0,
  },
  [AI_MODELS.FLUX_2_FLASH]: {
    maxReferenceImages: 0,
  },
  [AI_MODELS.FLUX_LORA]: {
    // B9 (D6): reference-image img2img enabled. The FAL adapter default
    // already carries `referenceStrength` + `referenceImageMode: 'img2img'`;
    // flipping this to 1 lets the LoRA workbench surface the reference-image
    // chip. The fal adapter swaps `fal-ai/flux-lora` → the `/image-to-image`
    // endpoint when a reference image is present.
    maxReferenceImages: 1,
  },
  [AI_MODELS.RECRAFT_V4_PRO]: {
    maxReferenceImages: 0,
  },
  [AI_MODELS.FLUX_KONTEXT_MAX]: {
    capabilities: ['seed', 'lora'] as const,
    maxReferenceImages: 4,
    maxLoras: 5,
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
