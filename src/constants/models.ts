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

// Re-exports for backwards compatibility.
export { AI_MODELS }
export type {
  ModelOption,
  QualityTier,
  StyleTag,
  VideoDefaults,
  VideoExtensionConfig,
}

export const MODEL_MESSAGE_KEYS: Record<string, string> = {
  [AI_MODELS.GEMINI_FLASH_IMAGE]: 'geminiFlashImage',
  [AI_MODELS.OPENAI_GPT_IMAGE_2]: 'openaiGptImage2',
  [AI_MODELS.FLUX_2_PRO]: 'flux2Pro',
  [AI_MODELS.FLUX_2_FLASH]: 'flux2Flash',
  [AI_MODELS.FLUX_LORA]: 'fluxLora',
  [AI_MODELS.GEMINI_PRO_IMAGE]: 'geminiProImage',
  [AI_MODELS.IDEOGRAM_3]: 'ideogram3',
  [AI_MODELS.SEEDREAM_45]: 'seedream45',
  [AI_MODELS.SEEDREAM_45_VOLCENGINE]: 'seedream45Volcengine',
  [AI_MODELS.NOVELAI_V45_FULL]: 'novelaiV45Full',
  [AI_MODELS.NOVELAI_V45_CURATED]: 'novelaiV45Curated',
  [AI_MODELS.ILLUSTRIOUS_XL]: 'illustriousXl',
  [AI_MODELS.ANIMA_PENCIL_XL]: 'animaPencilXl',
  [AI_MODELS.RECRAFT_V4_PRO]: 'recraftV4Pro',
  [AI_MODELS.FLUX_KONTEXT_MAX]: 'fluxKontextMax',
  [AI_MODELS.FISH_AUDIO_S2_PRO]: 'fishAudioS2Pro',
  [AI_MODELS.ELEVENLABS_V3]: 'elevenV3',
  [AI_MODELS.ELEVENLABS_SFX_V2]: 'elevenSfxV2',
  [AI_MODELS.HAPPYHORSE_10]: 'happyhorse10',
  [AI_MODELS.KLING_V3_PRO]: 'klingV3Pro',
  [AI_MODELS.LTX_23]: 'ltx23',
  [AI_MODELS.SEEDANCE_20]: 'seedance20',
  [AI_MODELS.SEEDANCE_20_FAST]: 'seedance20Fast',
  [AI_MODELS.SEEDANCE_20_REFERENCE]: 'seedance20Reference',
  [AI_MODELS.SEEDANCE_20_FAST_REFERENCE]: 'seedance20FastReference',
  [AI_MODELS.SEEDANCE_20_VOLCENGINE]: 'seedance20Volcengine',
  [AI_MODELS.SEEDANCE_20_FAST_VOLCENGINE]: 'seedance20FastVolcengine',
  [AI_MODELS.SEEDANCE_20_REFERENCE_VOLCENGINE]: 'seedance20ReferenceVolcengine',
  [AI_MODELS.SEEDANCE_20_FAST_REFERENCE_VOLCENGINE]:
    'seedance20FastReferenceVolcengine',
  [AI_MODELS.VEO_31]: 'veo31',
  [AI_MODELS.HUNYUAN3D_2_1]: 'hunyuan3d21',
  [AI_MODELS.HUNYUAN3D_V3]: 'hunyuan3dV3',
  [AI_MODELS.HUNYUAN3D_V31_PRO]: 'hunyuan3dV31Pro',
  [AI_MODELS.TRELLIS_2]: 'trellis2',
  [AI_MODELS.TRIPOSR]: 'triposr',
  [AI_MODELS.RODIN_GEN_2_5]: 'rodinGen25',
} as const

export const MODEL_ID_ALIASES: Record<string, AI_MODELS> = {
  'veo-3': AI_MODELS.VEO_31,
  'gemini-3.1-flash-image': AI_MODELS.GEMINI_FLASH_IMAGE,
}

export const normalizeModelId = (modelId: string): string =>
  MODEL_ID_ALIASES[modelId] ?? modelId

const BUILT_IN_MODEL_IDS = new Set<string>(Object.values(AI_MODELS))

export const RETIRED_MODEL_IDS = [
  AI_MODELS.HUNYUAN3D_2_1,
  // Keep this disabled catalog entry so Civitai Anima base-model LoRAs can
  // route to "open in Civitai" until a commercial hosted endpoint exists.
  AI_MODELS.ANIMA_PENCIL_XL,
] as const satisfies readonly AI_MODELS[]

const RETIRED_MODEL_ID_SET = new Set<string>(RETIRED_MODEL_IDS)

export const isRetiredModelId = (modelId: string): boolean =>
  RETIRED_MODEL_ID_SET.has(normalizeModelId(modelId))

export const MODEL_OPTIONS: ModelOption[] = [
  ...IMAGE_MODEL_OPTIONS,
  ...VIDEO_MODEL_OPTIONS,
  ...AUDIO_MODEL_OPTIONS,
  ...MODEL_3D_OPTIONS,
]

export const MODEL_FAMILIES: Record<string, string> = {
  [AI_MODELS.OPENAI_GPT_IMAGE_2]: 'GPT Image',
  [AI_MODELS.GEMINI_PRO_IMAGE]: 'Gemini',
  [AI_MODELS.GEMINI_FLASH_IMAGE]: 'Gemini',
  [AI_MODELS.FLUX_2_PRO]: 'FLUX',
  [AI_MODELS.FLUX_2_FLASH]: 'FLUX',
  [AI_MODELS.FLUX_LORA]: 'FLUX',
  [AI_MODELS.SEEDREAM_45]: 'Seedream',
  [AI_MODELS.SEEDREAM_45_VOLCENGINE]: 'Seedream',
  [AI_MODELS.IDEOGRAM_3]: 'Ideogram',
  [AI_MODELS.RECRAFT_V4_PRO]: 'Recraft',
  [AI_MODELS.NOVELAI_V45_FULL]: 'NovelAI',
  [AI_MODELS.NOVELAI_V45_CURATED]: 'NovelAI',
  [AI_MODELS.ILLUSTRIOUS_XL]: 'Illustrious',
  [AI_MODELS.ANIMA_PENCIL_XL]: 'Anima',
  [AI_MODELS.FLUX_KONTEXT_MAX]: 'FLUX',
  [AI_MODELS.KLING_V3_PRO]: 'Kling',
  [AI_MODELS.VEO_31]: 'Veo',
  [AI_MODELS.SEEDANCE_20]: 'Seedance',
  [AI_MODELS.SEEDANCE_20_FAST]: 'Seedance',
  [AI_MODELS.SEEDANCE_20_REFERENCE]: 'Seedance',
  [AI_MODELS.SEEDANCE_20_FAST_REFERENCE]: 'Seedance',
  [AI_MODELS.SEEDANCE_20_VOLCENGINE]: 'Seedance',
  [AI_MODELS.SEEDANCE_20_FAST_VOLCENGINE]: 'Seedance',
  [AI_MODELS.SEEDANCE_20_REFERENCE_VOLCENGINE]: 'Seedance',
  [AI_MODELS.SEEDANCE_20_FAST_REFERENCE_VOLCENGINE]: 'Seedance',
  [AI_MODELS.HAPPYHORSE_10]: 'HappyHorse',
  [AI_MODELS.LTX_23]: 'LTX',
  [AI_MODELS.FISH_AUDIO_S2_PRO]: 'Fish Audio',
  [AI_MODELS.ELEVENLABS_V3]: 'ElevenLabs',
  [AI_MODELS.HUNYUAN3D_2_1]: 'Hunyuan3D',
  [AI_MODELS.HUNYUAN3D_V3]: 'Hunyuan3D',
  [AI_MODELS.HUNYUAN3D_V31_PRO]: 'Hunyuan3D',
  [AI_MODELS.TRELLIS_2]: 'TRELLIS',
  [AI_MODELS.TRIPOSR]: 'TripoSR',
}

/** Get the model family for a model ID. */
export const getModelFamily = (modelId: string): string | null =>
  MODEL_FAMILIES[normalizeModelId(modelId)] ?? null

/** Get unique model family names, ordered by first appearance. */
export const getModelFamilyList = (): string[] => [
  ...new Set(Object.values(MODEL_FAMILIES)),
]

/** Get only the currently available models. */
export const getAvailableModels = (): ModelOption[] =>
  MODEL_OPTIONS.filter((model) => model.available)

/** Get a model option by its ID. */
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

const VIDEO_MODEL_PRIORITY: Partial<Record<AI_MODELS, number>> = {
  [AI_MODELS.SEEDANCE_20_FAST]: 1,
  // VolcEngine (cn) variant sits right after its fal counterpart.
  [AI_MODELS.SEEDANCE_20_FAST_VOLCENGINE]: 1.5,
  [AI_MODELS.SEEDANCE_20]: 2,
  [AI_MODELS.SEEDANCE_20_VOLCENGINE]: 2.5,
  [AI_MODELS.HAPPYHORSE_10]: 3,
  [AI_MODELS.VEO_31]: 4,
  [AI_MODELS.KLING_V3_PRO]: 5,
  [AI_MODELS.SEEDANCE_20_FAST_REFERENCE]: 6,
  [AI_MODELS.SEEDANCE_20_FAST_REFERENCE_VOLCENGINE]: 6.5,
  [AI_MODELS.SEEDANCE_20_REFERENCE]: 7,
  [AI_MODELS.SEEDANCE_20_REFERENCE_VOLCENGINE]: 7.5,
  [AI_MODELS.LTX_23]: 8,
}

/** Get only the currently available video models, sorted by recommendation. */
export const getAvailableVideoModels = (): ModelOption[] =>
  MODEL_OPTIONS.filter(
    (model) => model.available && model.outputType === 'VIDEO',
  ).sort(
    (a, b) =>
      (VIDEO_MODEL_PRIORITY[a.id] ?? 999) - (VIDEO_MODEL_PRIORITY[b.id] ?? 999),
  )

/** Get only the currently available image models. */
export const getAvailableImageModels = (): ModelOption[] =>
  MODEL_OPTIONS.filter(
    (model) => model.available && model.outputType === 'IMAGE',
  )

/** Get only the currently available audio models. */
export const getAvailableAudioModels = (): ModelOption[] =>
  MODEL_OPTIONS.filter(
    (model) => model.available && model.outputType === 'AUDIO',
  )

/** Get only the currently available 3D models (image-to-3D). */
export const getAvailableModel3DModels = (): ModelOption[] =>
  MODEL_OPTIONS.filter(
    (model) => model.available && model.outputType === 'MODEL_3D',
  )

/** Get only the free tier models. */
export const getFreeTierModels = (): ModelOption[] =>
  MODEL_OPTIONS.filter((model) => model.available && model.freeTier)

/** Check if a model is on the free tier. */
export const isFreeTierModel = (modelId: string): boolean => {
  const model = getModelById(modelId)
  return model?.available === true && model.freeTier === true
}

/** Provider group key for grouping models in UI. */
export type ProviderGroup =
  | 'openai'
  | 'google'
  | 'deepseek'
  | 'dashscope'
  | 'novelai'
  | 'fal'
  | 'runway'
  | 'volcengine'
  | 'opensource'
  | 'replicate'
  | 'fish_audio'
  | 'elevenlabs'
  | 'hyper3d'

/** Display order for provider groups. */
export const PROVIDER_GROUP_ORDER: ProviderGroup[] = [
  'openai',
  'google',
  'deepseek',
  'dashscope',
  'novelai',
  'fal',
  'runway',
  'volcengine',
  'fish_audio',
  'elevenlabs',
  'opensource',
  'replicate',
  'hyper3d',
]

/** Map adapter type to provider group. */
export function getProviderGroup(adapterType: AI_ADAPTER_TYPES): ProviderGroup {
  switch (adapterType) {
    case AI_ADAPTER_TYPES.OPENAI:
      return 'openai'
    case AI_ADAPTER_TYPES.GEMINI:
      return 'google'
    case AI_ADAPTER_TYPES.DEEPSEEK:
      return 'deepseek'
    case AI_ADAPTER_TYPES.DASHSCOPE:
      return 'dashscope'
    case AI_ADAPTER_TYPES.NOVELAI:
      return 'novelai'
    case AI_ADAPTER_TYPES.FAL:
      return 'fal'
    case AI_ADAPTER_TYPES.RUNWAY:
      return 'runway'
    case AI_ADAPTER_TYPES.VOLCENGINE:
      return 'volcengine'
    case AI_ADAPTER_TYPES.HUGGINGFACE:
      return 'opensource'
    case AI_ADAPTER_TYPES.REPLICATE:
      return 'replicate'
    case AI_ADAPTER_TYPES.FISH_AUDIO:
      return 'fish_audio'
    case AI_ADAPTER_TYPES.ELEVENLABS:
      return 'elevenlabs'
    case AI_ADAPTER_TYPES.HYPER3D_RODIN:
      return 'hyper3d'
  }
}

/** Group model options by provider, preserving order within each group. */
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

/** Display order for style groups. */
export const STYLE_GROUP_ORDER: StyleTag[] = [
  'photorealistic',
  'anime',
  'design',
  'artistic',
  'general',
]

/** Group model options by style tag, preserving order within each group. */
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

/** Get the provider timeout for a model (defaults to 45s for images). */
export const getModelTimeout = (modelId: string): number =>
  getModelById(modelId)?.timeoutMs ?? 45_000

/** Check if a model supports LoRA adapters. */
export const modelSupportsLora = (modelId: string): boolean =>
  getModelById(modelId)?.supportsLora === true

/** Check if a model supports long video extension. */
export const supportsLongVideo = (modelId: string): boolean =>
  getModelById(modelId)?.videoExtension != null

/** Get only the video models that support long video extension. */
export const getLongVideoModels = (): ModelOption[] =>
  MODEL_OPTIONS.filter(
    (model) =>
      model.available && model.outputType === 'VIDEO' && model.videoExtension,
  )
