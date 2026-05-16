import { AI_ADAPTER_TYPES, type ProviderConfig } from '@/constants/providers'
import { AI_MODELS } from '@/constants/models/enum'
import type {
  ModelOption,
  QualityTier,
  StyleTag,
  VideoDefaults,
  VideoExtensionConfig,
} from '@/constants/models/types'
import { IMAGE_MODEL_OPTIONS } from '@/constants/models/image'
import { VIDEO_MODEL_OPTIONS } from '@/constants/models/video'
import { AUDIO_MODEL_OPTIONS } from '@/constants/models/audio'
import { MODEL_3D_OPTIONS } from '@/constants/models/model-3d'

// ─── Re-exports for backwards compatibility ──────────────────────
// Historically every consumer imported from `@/constants/models`. Splitting
// the option arrays into per-output-type files (image/video/audio) keeps the
// import surface stable so the 140+ downstream files don't have to move.

export { AI_MODELS }
export type {
  ModelOption,
  QualityTier,
  StyleTag,
  VideoDefaults,
  VideoExtensionConfig,
}

// ─── i18n + alias maps ───────────────────────────────────────────

export const MODEL_MESSAGE_KEYS: Record<string, string> = {
  [AI_MODELS.SDXL]: 'sdxl',
  [AI_MODELS.ANIMAGINE_XL_4]: 'animagineXl4',
  [AI_MODELS.GEMINI_FLASH_IMAGE]: 'geminiFlashImage',
  [AI_MODELS.OPENAI_GPT_IMAGE_2]: 'openaiGptImage2',
  [AI_MODELS.FLUX_2_PRO]: 'flux2Pro',
  [AI_MODELS.FLUX_2_DEV]: 'flux2Dev',
  [AI_MODELS.FLUX_2_SCHNELL]: 'flux2Schnell',
  [AI_MODELS.FLUX_LORA]: 'fluxLora',
  [AI_MODELS.GEMINI_PRO_IMAGE]: 'geminiProImage',
  [AI_MODELS.IDEOGRAM_3]: 'ideogram3',
  [AI_MODELS.RECRAFT_V3]: 'recraftV3',
  [AI_MODELS.SEEDREAM_45]: 'seedream45',
  [AI_MODELS.SEEDREAM_50_LITE]: 'seedream50Lite',
  [AI_MODELS.SEEDREAM_40]: 'seedream40',
  [AI_MODELS.SEEDREAM_30]: 'seedream30',
  [AI_MODELS.SD_35_LARGE]: 'sd35Large',
  [AI_MODELS.NOVELAI_V45_FULL]: 'novelaiV45Full',
  [AI_MODELS.NOVELAI_V45_CURATED]: 'novelaiV45Curated',
  [AI_MODELS.ILLUSTRIOUS_XL]: 'illustriousXl',
  [AI_MODELS.NOVELAI_V4_FULL]: 'novelaiV4Full',
  [AI_MODELS.NOVELAI_V3]: 'novelaiV3',
  [AI_MODELS.GEMINI_25_FLASH_IMAGE]: 'gemini25FlashImage',
  [AI_MODELS.FLUX_2_MAX]: 'flux2Max',
  [AI_MODELS.RECRAFT_V4_PRO]: 'recraftV4Pro',
  [AI_MODELS.FLUX_KONTEXT_PRO]: 'fluxKontextPro',
  [AI_MODELS.FLUX_KONTEXT_MAX]: 'fluxKontextMax',
  [AI_MODELS.PLAYGROUND_V25]: 'playgroundV25',
  [AI_MODELS.FISH_AUDIO_S2_PRO]: 'fishAudioS2Pro',
  [AI_MODELS.FAL_F5_TTS]: 'falF5Tts',
  [AI_MODELS.KLING_VIDEO]: 'klingVideo',
  [AI_MODELS.KLING_V3_PRO]: 'klingV3Pro',
  [AI_MODELS.MINIMAX_VIDEO]: 'minimaxVideo',
  [AI_MODELS.LUMA_RAY_2]: 'lumaRay2',
  [AI_MODELS.WAN_VIDEO]: 'wanVideo',
  [AI_MODELS.HUNYUAN_VIDEO]: 'hunyuanVideo',
  [AI_MODELS.SEEDANCE_20]: 'seedance20',
  [AI_MODELS.SEEDANCE_20_FAST]: 'seedance20Fast',
  [AI_MODELS.SEEDANCE_20_VOLC]: 'seedance20Volc',
  [AI_MODELS.SEEDANCE_20_FAST_VOLC]: 'seedance20FastVolc',
  [AI_MODELS.SEEDANCE_PRO]: 'seedancePro',
  [AI_MODELS.SEEDANCE_15_PRO]: 'seedance15Pro',
  [AI_MODELS.SEEDANCE_10_PRO]: 'seedance10Pro',
  [AI_MODELS.VEO_31]: 'veo31',
  [AI_MODELS.PIKA_V25]: 'pikaV25',
  [AI_MODELS.RUNWAY_GEN3]: 'runwayGen3',
  [AI_MODELS.HUNYUAN3D_2_1]: 'hunyuan3d21',
  [AI_MODELS.HUNYUAN3D_V3]: 'hunyuan3dV3',
  [AI_MODELS.HUNYUAN3D_V31_PRO]: 'hunyuan3dV31Pro',
  [AI_MODELS.TRELLIS_2]: 'trellis2',
  [AI_MODELS.TRIPOSR]: 'triposr',
} as const

export const MODEL_ID_ALIASES: Record<string, AI_MODELS> = {
  'veo-3': AI_MODELS.VEO_31,
  'pika-v2.2': AI_MODELS.PIKA_V25,
}

export const normalizeModelId = (modelId: string): string =>
  MODEL_ID_ALIASES[modelId] ?? modelId

const BUILT_IN_MODEL_IDS = new Set<string>(Object.values(AI_MODELS))

export const RETIRED_MODEL_IDS = [
  AI_MODELS.SEEDREAM_30,
  AI_MODELS.PLAYGROUND_V25,
  AI_MODELS.NOVELAI_V3,
  AI_MODELS.RECRAFT_V3,
  AI_MODELS.GEMINI_25_FLASH_IMAGE,
  AI_MODELS.FLUX_LORA,
  AI_MODELS.NOVELAI_V4_FULL,
  AI_MODELS.SDXL,
  AI_MODELS.SEEDANCE_PRO,
  AI_MODELS.SEEDANCE_15_PRO,
  AI_MODELS.SEEDANCE_10_PRO,
  AI_MODELS.PIKA_V25,
  AI_MODELS.KLING_VIDEO,
  AI_MODELS.FAL_F5_TTS,
  AI_MODELS.HUNYUAN3D_2_1,
] as const satisfies readonly AI_MODELS[]

const RETIRED_MODEL_ID_SET = new Set<string>(RETIRED_MODEL_IDS)

export const isRetiredModelId = (modelId: string): boolean =>
  RETIRED_MODEL_ID_SET.has(normalizeModelId(modelId))

// ─── Aggregated MODEL_OPTIONS ────────────────────────────────────
// Order matters for the model picker — image first (most common path),
// then video, then audio. The sub-modules each preserve internal ranking.

export const MODEL_OPTIONS: ModelOption[] = [
  ...IMAGE_MODEL_OPTIONS,
  ...VIDEO_MODEL_OPTIONS,
  ...AUDIO_MODEL_OPTIONS,
  ...MODEL_3D_OPTIONS,
]

/**
 * Model family grouping — maps each model to its product family.
 * Used for leaderboard grouping and cross-version comparison.
 */
export const MODEL_FAMILIES: Record<string, string> = {
  // Image families
  [AI_MODELS.OPENAI_GPT_IMAGE_2]: 'GPT Image',
  [AI_MODELS.GEMINI_PRO_IMAGE]: 'Gemini',
  [AI_MODELS.GEMINI_FLASH_IMAGE]: 'Gemini',
  [AI_MODELS.FLUX_2_PRO]: 'FLUX',
  [AI_MODELS.FLUX_2_DEV]: 'FLUX',
  [AI_MODELS.FLUX_2_SCHNELL]: 'FLUX',
  [AI_MODELS.SEEDREAM_45]: 'Seedream',
  [AI_MODELS.SEEDREAM_50_LITE]: 'Seedream',
  [AI_MODELS.SEEDREAM_40]: 'Seedream',
  [AI_MODELS.SEEDREAM_30]: 'Seedream',
  [AI_MODELS.IDEOGRAM_3]: 'Ideogram',
  [AI_MODELS.RECRAFT_V3]: 'Recraft',
  [AI_MODELS.SD_35_LARGE]: 'Stable Diffusion',
  [AI_MODELS.SDXL]: 'Stable Diffusion',
  [AI_MODELS.ANIMAGINE_XL_4]: 'Stable Diffusion',
  [AI_MODELS.PLAYGROUND_V25]: 'Playground',
  [AI_MODELS.NOVELAI_V45_FULL]: 'NovelAI',
  [AI_MODELS.NOVELAI_V45_CURATED]: 'NovelAI',
  [AI_MODELS.ILLUSTRIOUS_XL]: 'Illustrious',
  [AI_MODELS.NOVELAI_V4_FULL]: 'NovelAI',
  [AI_MODELS.NOVELAI_V3]: 'NovelAI',
  [AI_MODELS.GEMINI_25_FLASH_IMAGE]: 'Gemini',
  [AI_MODELS.FLUX_2_MAX]: 'FLUX',
  [AI_MODELS.RECRAFT_V4_PRO]: 'Recraft',
  [AI_MODELS.FLUX_KONTEXT_PRO]: 'FLUX',
  [AI_MODELS.FLUX_KONTEXT_MAX]: 'FLUX',
  // Video families
  [AI_MODELS.KLING_V3_PRO]: 'Kling',
  [AI_MODELS.KLING_VIDEO]: 'Kling',
  [AI_MODELS.VEO_31]: 'Veo',
  [AI_MODELS.SEEDANCE_20]: 'Seedance',
  [AI_MODELS.SEEDANCE_20_FAST]: 'Seedance',
  [AI_MODELS.SEEDANCE_20_VOLC]: 'Seedance',
  [AI_MODELS.SEEDANCE_20_FAST_VOLC]: 'Seedance',
  [AI_MODELS.SEEDANCE_PRO]: 'Seedance',
  [AI_MODELS.SEEDANCE_15_PRO]: 'Seedance',
  [AI_MODELS.SEEDANCE_10_PRO]: 'Seedance',
  [AI_MODELS.MINIMAX_VIDEO]: 'MiniMax',
  [AI_MODELS.LUMA_RAY_2]: 'Luma',
  [AI_MODELS.PIKA_V25]: 'Pika',
  [AI_MODELS.WAN_VIDEO]: 'Wan',
  [AI_MODELS.HUNYUAN_VIDEO]: 'Hunyuan',
  [AI_MODELS.RUNWAY_GEN3]: 'Runway',
  // Audio families
  [AI_MODELS.FISH_AUDIO_S2_PRO]: 'Fish Audio',
  [AI_MODELS.FAL_F5_TTS]: 'F5-TTS',
  // 3D families
  [AI_MODELS.HUNYUAN3D_2_1]: 'Hunyuan3D',
  [AI_MODELS.HUNYUAN3D_V3]: 'Hunyuan3D',
  [AI_MODELS.HUNYUAN3D_V31_PRO]: 'Hunyuan3D',
  [AI_MODELS.TRELLIS_2]: 'TRELLIS',
  [AI_MODELS.TRIPOSR]: 'TripoSR',
}

/** Get the model family for a model ID */
export const getModelFamily = (modelId: string): string | null =>
  MODEL_FAMILIES[normalizeModelId(modelId)] ?? null

/** Get unique model family names (ordered by first appearance) */
export const getModelFamilyList = (): string[] => [
  ...new Set(Object.values(MODEL_FAMILIES)),
]

/** Get only the currently available models */
export const getAvailableModels = (): ModelOption[] =>
  MODEL_OPTIONS.filter((model) => model.available)

/** Get a model option by its ID */
export const getModelById = (id: string): ModelOption | undefined =>
  MODEL_OPTIONS.find((model) => model.id === normalizeModelId(id))

export const getModelMessageKey = (id: string): string =>
  MODEL_MESSAGE_KEYS[normalizeModelId(id)] ?? id

export const getExecutionModelId = (modelId: string): string =>
  getModelById(modelId)?.externalModelId ?? modelId

export const resolveAdapterType = (modelId: string): AI_ADAPTER_TYPES | null =>
  getModelById(modelId)?.adapterType ?? null

export const getBuiltInProviderConfig = (
  modelId: string,
): ProviderConfig | null => getModelById(modelId)?.providerConfig ?? null

export const isBuiltInModel = (value: string): value is AI_MODELS =>
  BUILT_IN_MODEL_IDS.has(normalizeModelId(value))

export const isAiModel = isBuiltInModel

/** Get only the currently available video models */
export const getAvailableVideoModels = (): ModelOption[] =>
  MODEL_OPTIONS.filter(
    (model) => model.available && model.outputType === 'VIDEO',
  )

/** Get only the currently available image models */
export const getAvailableImageModels = (): ModelOption[] =>
  MODEL_OPTIONS.filter(
    (model) => model.available && model.outputType === 'IMAGE',
  )

/** Get only the currently available audio models */
export const getAvailableAudioModels = (): ModelOption[] =>
  MODEL_OPTIONS.filter(
    (model) => model.available && model.outputType === 'AUDIO',
  )

/** Get only the currently available 3D models (image-to-3D) */
export const getAvailableModel3DModels = (): ModelOption[] =>
  MODEL_OPTIONS.filter(
    (model) => model.available && model.outputType === 'MODEL_3D',
  )

/** Get only the free tier models */
export const getFreeTierModels = (): ModelOption[] =>
  MODEL_OPTIONS.filter((model) => model.available && model.freeTier)

/** Check if a model is on the free tier */
export const isFreeTierModel = (modelId: string): boolean => {
  const model = getModelById(modelId)
  return model?.available === true && model.freeTier === true
}

/** Provider group key for grouping models in UI */
export type ProviderGroup =
  | 'openai'
  | 'google'
  | 'novelai'
  | 'fal'
  | 'volcengine'
  | 'opensource'
  | 'replicate'
  | 'fish_audio'

/** Display order for provider groups */
export const PROVIDER_GROUP_ORDER: ProviderGroup[] = [
  'openai',
  'google',
  'novelai',
  'fal',
  'volcengine',
  'fish_audio',
  'opensource',
  'replicate',
]

/** Map adapter type to provider group */
export function getProviderGroup(adapterType: AI_ADAPTER_TYPES): ProviderGroup {
  switch (adapterType) {
    case AI_ADAPTER_TYPES.OPENAI:
      return 'openai'
    case AI_ADAPTER_TYPES.GEMINI:
      return 'google'
    case AI_ADAPTER_TYPES.NOVELAI:
      return 'novelai'
    case AI_ADAPTER_TYPES.FAL:
      return 'fal'
    case AI_ADAPTER_TYPES.VOLCENGINE:
      return 'volcengine'
    case AI_ADAPTER_TYPES.HUGGINGFACE:
      return 'opensource'
    case AI_ADAPTER_TYPES.REPLICATE:
      return 'replicate'
    case AI_ADAPTER_TYPES.FISH_AUDIO:
      return 'fish_audio'
  }
}

/** Group model options by provider, preserving order within each group */
export function groupModelsByProvider(
  models: ModelOption[],
): { group: ProviderGroup; models: ModelOption[] }[] {
  const grouped = new Map<ProviderGroup, ModelOption[]>()
  for (const model of models) {
    const group = getProviderGroup(model.adapterType)
    const list = grouped.get(group) ?? []
    list.push(model)
    grouped.set(group, list)
  }
  return PROVIDER_GROUP_ORDER.filter((group) => grouped.has(group)).map(
    (group) => ({ group, models: grouped.get(group)! }),
  )
}

/** Display order for style groups */
export const STYLE_GROUP_ORDER: StyleTag[] = [
  'photorealistic',
  'anime',
  'design',
  'artistic',
  'general',
]

/** Group model options by style tag, preserving order within each group */
export function groupModelsByStyle(
  models: ModelOption[],
): { group: StyleTag; models: ModelOption[] }[] {
  const grouped = new Map<StyleTag, ModelOption[]>()
  for (const model of models) {
    const tag = model.styleTag ?? 'general'
    const list = grouped.get(tag) ?? []
    list.push(model)
    grouped.set(tag, list)
  }
  return STYLE_GROUP_ORDER.filter((group) => grouped.has(group)).map(
    (group) => ({ group, models: grouped.get(group)! }),
  )
}

/** Get the provider timeout for a model (defaults to 45s for images) */
export const getModelTimeout = (modelId: string): number =>
  getModelById(modelId)?.timeoutMs ?? 45_000

/** Check if a model supports LoRA adapters */
export const modelSupportsLora = (modelId: string): boolean =>
  getModelById(modelId)?.supportsLora === true

/** Check if a model supports long video extension */
export const supportsLongVideo = (modelId: string): boolean =>
  getModelById(modelId)?.videoExtension != null

/** Get only the video models that support long video extension */
export const getLongVideoModels = (): ModelOption[] =>
  MODEL_OPTIONS.filter(
    (model) =>
      model.available && model.outputType === 'VIDEO' && model.videoExtension,
  )
