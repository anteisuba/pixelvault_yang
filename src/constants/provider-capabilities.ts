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
 * - 'img2img': Model treats reference as base image to modify / style transfer (fal.ai Flux, Recraft, SD)
 * - 'director': Specialized character reference system with high reference weight (NovelAI)
 */
export type ReferenceImageMode = 'native' | 'img2img' | 'director'

export const OPENAI_GPT_IMAGE_MAX_REFERENCE_IMAGES = 16
export const VOLCENGINE_SEEDREAM_MAX_REFERENCE_IMAGES = 14
export const IDEOGRAM_STYLE_REFERENCE_MAX_IMAGES = 3
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
      referenceImageMode: 'director',
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

    [AI_ADAPTER_TYPES.RUNWAY]: {
      capabilities: [],
      maxReferenceImages: 1,
      referenceImageMode: 'native',
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
      maxLoras: 2,
      maxReferenceImages: 1,
    },

    [AI_ADAPTER_TYPES.OPENAI]: {
      capabilities: ['quality', 'background', 'style', 'imageAnalysis'],
      qualityOptions: ['auto', 'low', 'medium', 'high'],
      backgroundOptions: ['auto', 'transparent', 'opaque'],
      styleOptions: ['vivid', 'natural'],
      maxReferenceImages: 1,
      referenceImageMode: 'native',
    },

    [AI_ADAPTER_TYPES.DEEPSEEK]: {
      capabilities: [],
    },

    [AI_ADAPTER_TYPES.GEMINI]: {
      capabilities: ['imageAnalysis'],
      maxReferenceImages: 14,
      referenceImageMode: 'native',
    },

    [AI_ADAPTER_TYPES.VOLCENGINE]: {
      capabilities: ['seed', 'guidanceScale', 'imageAnalysis'],
      guidanceScale: { min: 1, max: 10, step: 0.5, default: 8.0 },
      maxReferenceImages: VOLCENGINE_SEEDREAM_MAX_REFERENCE_IMAGES,
      referenceImageMode: 'native',
    },

    [AI_ADAPTER_TYPES.FISH_AUDIO]: {
      capabilities: ['voiceSelection', 'speed', 'sampleRate'],
    },

    [AI_ADAPTER_TYPES.HYPER3D_RODIN]: {
      capabilities: ['seed'] as const,
      maxReferenceImages: 5,
      referenceImageMode: 'native' as const,
    },
  }

// ─── Per-Model Capability Overrides ─────────────────────────────
// When a model needs different capabilities than its adapter default,
// add an entry keyed by model ID (AI_MODELS enum value).
// Only specified fields are overridden; unspecified fall through to adapter.

export const MODEL_CAPABILITY_OVERRIDES: Partial<
  Record<string, Partial<CapabilityConfig>>
> = {
  [AI_MODELS.OPENAI_GPT_IMAGE_2]: {
    maxReferenceImages: OPENAI_GPT_IMAGE_MAX_REFERENCE_IMAGES,
  },
  [AI_MODELS.FLUX_2_PRO]: {
    maxReferenceImages: 0,
  },
  [AI_MODELS.SEEDREAM_45]: {
    maxReferenceImages: 0,
  },
  [AI_MODELS.IDEOGRAM_3]: {
    maxReferenceImages: IDEOGRAM_STYLE_REFERENCE_MAX_IMAGES,
    referenceImageMode: 'native' as const,
  },
  [AI_MODELS.RECRAFT_V3]: {
    maxReferenceImages: 0,
  },
  [AI_MODELS.SEEDREAM_50_LITE]: {
    maxReferenceImages: VOLCENGINE_SEEDREAM_MAX_REFERENCE_IMAGES,
  },
  [AI_MODELS.SEEDREAM_40]: {
    maxReferenceImages: VOLCENGINE_SEEDREAM_MAX_REFERENCE_IMAGES,
  },
  [AI_MODELS.FLUX_2_DEV]: {
    maxReferenceImages: 0,
  },
  [AI_MODELS.FLUX_2_SCHNELL]: {
    maxReferenceImages: 0,
  },
  [AI_MODELS.FLUX_LORA]: {
    maxReferenceImages: 0,
  },
  [AI_MODELS.FLUX_2_MAX]: {
    maxReferenceImages: 0,
  },
  [AI_MODELS.RECRAFT_V4_PRO]: {
    maxReferenceImages: 0,
  },
  // Kontext: seed + lora, native reference image handling
  [AI_MODELS.FLUX_KONTEXT_PRO]: {
    capabilities: ['seed', 'lora'] as const,
    maxReferenceImages: 1,
    maxLoras: 5,
    referenceImageMode: 'native' as const,
  },
  [AI_MODELS.FLUX_KONTEXT_MAX]: {
    capabilities: ['seed', 'lora'] as const,
    maxReferenceImages: 4,
    maxLoras: 5,
    referenceImageMode: 'native' as const,
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
