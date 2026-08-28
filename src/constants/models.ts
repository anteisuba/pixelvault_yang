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
  [AI_MODELS.FLUX_2_PRO_EDIT]: 'flux2ProEdit',
  [AI_MODELS.FLUX_2_FLASH]: 'flux2Flash',
  [AI_MODELS.FLUX_LORA]: 'fluxLora',
  [AI_MODELS.GEMINI_PRO_IMAGE]: 'geminiProImage',
  [AI_MODELS.IDEOGRAM_3]: 'ideogram3',
  [AI_MODELS.SEEDREAM_45]: 'seedream45',
  [AI_MODELS.SEEDREAM_45_VOLCENGINE]: 'seedream45Volcengine',
  [AI_MODELS.SEEDREAM_50_PRO]: 'seedream50Pro',
  [AI_MODELS.SEEDREAM_50_LITE]: 'seedream50Lite',
  [AI_MODELS.SEEDREAM_50_VOLCENGINE]: 'seedream50Volcengine',
  [AI_MODELS.SEEDREAM_50_LITE_VOLCENGINE]: 'seedream50LiteVolcengine',
  [AI_MODELS.SEEDREAM_50_PRO_VOLCENGINE]: 'seedream50ProVolcengine',
  [AI_MODELS.SEEDREAM_50_PRO_BYTEPLUS]: 'seedream50ProByteplus',
  [AI_MODELS.SEEDREAM_50_LITE_BYTEPLUS]: 'seedream50LiteByteplus',
  [AI_MODELS.GEMINI_FLASH_LITE_IMAGE]: 'geminiFlashLiteImage',
  [AI_MODELS.NOVELAI_V45_FULL]: 'novelaiV45Full',
  [AI_MODELS.NOVELAI_V45_CURATED]: 'novelaiV45Curated',
  [AI_MODELS.NOVELAI_V5_FULL]: 'novelaiV5Full',
  [AI_MODELS.NOVELAI_V5_CURATED]: 'novelaiV5Curated',
  [AI_MODELS.ILLUSTRIOUS_XL]: 'illustriousXl',
  [AI_MODELS.ANIMA_PENCIL_XL]: 'animaPencilXl',
  [AI_MODELS.RECRAFT_V4_PRO]: 'recraftV4Pro',
  [AI_MODELS.FLUX_KONTEXT_MAX]: 'fluxKontextMax',
  [AI_MODELS.ILLUSTRIOUS_RECIPE_CLONE]: 'illustriousRecipeClone',
  [AI_MODELS.ANIMA_PENCIL_XL_RUNNER]: 'animaPencilXlRunner',
  [AI_MODELS.PONY_DIFFUSION_V6]: 'ponyDiffusionV6',
  [AI_MODELS.SDXL_10_RUNNER]: 'sdxl10Runner',
  [AI_MODELS.ANIMA_DIT_RUNNER]: 'animaDitRunner',
  [AI_MODELS.FISH_AUDIO_S2_PRO]: 'fishAudioS2Pro',
  [AI_MODELS.ELEVENLABS_V3]: 'elevenV3',
  [AI_MODELS.ELEVENLABS_SFX_V2]: 'elevenSfxV2',
  [AI_MODELS.ELEVENLABS_MUSIC_V2]: 'elevenMusicV2',
  [AI_MODELS.HAPPYHORSE_10]: 'happyhorse10',
  [AI_MODELS.WAN_30]: 'wan30',
  [AI_MODELS.WAN_30_REFERENCE]: 'wan30Reference',
  [AI_MODELS.KLING_V3_PRO]: 'klingV3Pro',
  [AI_MODELS.KLING_O3_PRO]: 'klingO3Pro',
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
  [AI_MODELS.SEEDANCE_20_BYTEPLUS]: 'seedance20Byteplus',
  [AI_MODELS.SEEDANCE_20_FAST_BYTEPLUS]: 'seedance20FastByteplus',
  [AI_MODELS.SEEDANCE_20_REFERENCE_BYTEPLUS]: 'seedance20ReferenceByteplus',
  [AI_MODELS.SEEDANCE_20_FAST_REFERENCE_BYTEPLUS]:
    'seedance20FastReferenceByteplus',
  [AI_MODELS.VEO_31]: 'veo31',
  [AI_MODELS.GEMINI_OMNI_FLASH]: 'geminiOmniFlash',
  [AI_MODELS.SEEDANCE_25]: 'seedance25',
  [AI_MODELS.SEEDANCE_25_REFERENCE]: 'seedance25Reference',
  [AI_MODELS.SEEDANCE_25_VOLCENGINE]: 'seedance25Volcengine',
  [AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE]: 'seedance25ReferenceVolcengine',
  [AI_MODELS.SEEDANCE_25_BYTEPLUS]: 'seedance25Byteplus',
  [AI_MODELS.SEEDANCE_25_REFERENCE_BYTEPLUS]: 'seedance25ReferenceByteplus',
  [AI_MODELS.MINIMAX_H3]: 'minimaxH3',
  [AI_MODELS.MINIMAX_H3_REFERENCE]: 'minimaxH3Reference',
  [AI_MODELS.MINIMAX_H3_CN]: 'minimaxH3Cn',
  [AI_MODELS.MINIMAX_H3_REFERENCE_CN]: 'minimaxH3ReferenceCn',
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
  // ─── 2026-07-26 slim-down (market-mainstream audit) ───────────────
  // Entries stay in the catalog so archived generations keep resolving a
  // label and family — permanent archival is a product guarantee.
  AI_MODELS.SEEDREAM_45,
  AI_MODELS.SEEDREAM_45_VOLCENGINE,
  AI_MODELS.IDEOGRAM_3,
  AI_MODELS.VEO_31,
  AI_MODELS.LTX_23,
  AI_MODELS.ELEVENLABS_V3,
] as const satisfies readonly AI_MODELS[]

const RETIRED_MODEL_ID_SET = new Set<string>(RETIRED_MODEL_IDS)

export const isRetiredModelId = (modelId: string): boolean =>
  RETIRED_MODEL_ID_SET.has(normalizeModelId(modelId))

/**
 * **Reserved**, the third reason a catalog entry can be `available: false` —
 * distinct from retired (dead upstream) and from the runner's feature flag.
 *
 * A reserved entry is fully modelled (catalog row, capability matrix,
 * reference slots, i18n) but the provider has not opened the API yet, so it
 * carries a placeholder `externalModelId` and must not be selectable. Going
 * live is meant to be a small, reviewable diff rather than a fresh integration.
 *
 * Listing an id here is a promise that someone will come back for it — keep it
 * short, and delete the entry the moment the model ships or the plan dies.
 */
/**
 * 「预留」是 `available: false` 的第三种合法理由（另两种：RETIRED 已退役、
 * RUNNER 特性开关）。往里加一个 id 等于承诺有人会回来收尾 ——
 * **模型一上线、或计划一死，就删掉那行。**
 *
 * 现在是空的：唯二的住户（Seedance 2.5 火山双变体）在火山 2026-08-07 开放 API
 * 之后已于 08-08 上线，按上面这条规矩清出。数组和 `isReservedModelId` 保留是
 * 因为机制本身还要用——下一个「已官宣、未开放」的模型直接往里加即可。
 */
export const RESERVED_MODEL_IDS = [] as const satisfies readonly AI_MODELS[]

const RESERVED_MODEL_ID_SET = new Set<string>(RESERVED_MODEL_IDS)

export const isReservedModelId = (modelId: string): boolean =>
  RESERVED_MODEL_ID_SET.has(normalizeModelId(modelId))

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
  [AI_MODELS.FLUX_2_PRO_EDIT]: 'FLUX',
  [AI_MODELS.FLUX_2_FLASH]: 'FLUX',
  [AI_MODELS.FLUX_LORA]: 'FLUX',
  [AI_MODELS.SEEDREAM_45]: 'Seedream',
  [AI_MODELS.SEEDREAM_45_VOLCENGINE]: 'Seedream',
  [AI_MODELS.SEEDREAM_50_PRO]: 'Seedream',
  [AI_MODELS.SEEDREAM_50_LITE]: 'Seedream',
  [AI_MODELS.SEEDREAM_50_VOLCENGINE]: 'Seedream',
  [AI_MODELS.SEEDREAM_50_LITE_VOLCENGINE]: 'Seedream',
  [AI_MODELS.SEEDREAM_50_PRO_VOLCENGINE]: 'Seedream',
  [AI_MODELS.SEEDREAM_50_PRO_BYTEPLUS]: 'Seedream',
  [AI_MODELS.SEEDREAM_50_LITE_BYTEPLUS]: 'Seedream',
  [AI_MODELS.GEMINI_FLASH_LITE_IMAGE]: 'Gemini',
  [AI_MODELS.IDEOGRAM_3]: 'Ideogram',
  [AI_MODELS.RECRAFT_V4_PRO]: 'Recraft',
  [AI_MODELS.NOVELAI_V45_FULL]: 'NovelAI',
  [AI_MODELS.NOVELAI_V45_CURATED]: 'NovelAI',
  [AI_MODELS.NOVELAI_V5_FULL]: 'NovelAI',
  [AI_MODELS.NOVELAI_V5_CURATED]: 'NovelAI',
  [AI_MODELS.ILLUSTRIOUS_XL]: 'Illustrious',
  [AI_MODELS.ANIMA_PENCIL_XL]: 'Anima',
  [AI_MODELS.FLUX_KONTEXT_MAX]: 'FLUX',
  [AI_MODELS.ILLUSTRIOUS_RECIPE_CLONE]: 'Illustrious',
  [AI_MODELS.ANIMA_PENCIL_XL_RUNNER]: 'Anima',
  [AI_MODELS.PONY_DIFFUSION_V6]: 'Pony',
  [AI_MODELS.SDXL_10_RUNNER]: 'SDXL',
  [AI_MODELS.ANIMA_DIT_RUNNER]: 'Anima',
  [AI_MODELS.KLING_V3_PRO]: 'Kling',
  [AI_MODELS.KLING_O3_PRO]: 'Kling',
  [AI_MODELS.VEO_31]: 'Veo',
  [AI_MODELS.GEMINI_OMNI_FLASH]: 'Gemini',
  [AI_MODELS.SEEDANCE_25]: 'Seedance',
  [AI_MODELS.SEEDANCE_25_REFERENCE]: 'Seedance',
  [AI_MODELS.SEEDANCE_25_VOLCENGINE]: 'Seedance',
  [AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE]: 'Seedance',
  [AI_MODELS.SEEDANCE_25_BYTEPLUS]: 'Seedance',
  [AI_MODELS.SEEDANCE_25_REFERENCE_BYTEPLUS]: 'Seedance',
  [AI_MODELS.MINIMAX_H3]: 'MiniMax',
  [AI_MODELS.MINIMAX_H3_REFERENCE]: 'MiniMax',
  [AI_MODELS.MINIMAX_H3_CN]: 'MiniMax',
  [AI_MODELS.MINIMAX_H3_REFERENCE_CN]: 'MiniMax',
  [AI_MODELS.SEEDANCE_20]: 'Seedance',
  [AI_MODELS.SEEDANCE_20_FAST]: 'Seedance',
  [AI_MODELS.SEEDANCE_20_REFERENCE]: 'Seedance',
  [AI_MODELS.SEEDANCE_20_FAST_REFERENCE]: 'Seedance',
  [AI_MODELS.SEEDANCE_20_VOLCENGINE]: 'Seedance',
  [AI_MODELS.SEEDANCE_20_FAST_VOLCENGINE]: 'Seedance',
  [AI_MODELS.SEEDANCE_20_REFERENCE_VOLCENGINE]: 'Seedance',
  [AI_MODELS.SEEDANCE_20_FAST_REFERENCE_VOLCENGINE]: 'Seedance',
  [AI_MODELS.SEEDANCE_20_BYTEPLUS]: 'Seedance',
  [AI_MODELS.SEEDANCE_20_FAST_BYTEPLUS]: 'Seedance',
  [AI_MODELS.SEEDANCE_20_REFERENCE_BYTEPLUS]: 'Seedance',
  [AI_MODELS.SEEDANCE_20_FAST_REFERENCE_BYTEPLUS]: 'Seedance',
  [AI_MODELS.HAPPYHORSE_10]: 'HappyHorse',
  // Wan is Tongyi Wanxiang, a separate Alibaba line from HappyHorse — two
  // families, not one brand with two models.
  [AI_MODELS.WAN_30]: 'Wan',
  [AI_MODELS.WAN_30_REFERENCE]: 'Wan',
  [AI_MODELS.LTX_23]: 'LTX',
  [AI_MODELS.FISH_AUDIO_S2_PRO]: 'Fish Audio',
  [AI_MODELS.ELEVENLABS_V3]: 'ElevenLabs',
  [AI_MODELS.ELEVENLABS_SFX_V2]: 'ElevenLabs',
  [AI_MODELS.ELEVENLABS_MUSIC_V2]: 'ElevenLabs',
  [AI_MODELS.HUNYUAN3D_2_1]: 'Hunyuan3D',
  [AI_MODELS.HUNYUAN3D_V3]: 'Hunyuan3D',
  [AI_MODELS.HUNYUAN3D_V31_PRO]: 'Hunyuan3D',
  [AI_MODELS.TRELLIS_2]: 'TRELLIS',
  [AI_MODELS.TRIPOSR]: 'TripoSR',
  // 2026-08-08 补登记：全模态盘点时发现它是唯一没有 family 的模型。选择器第一层
  // 改成按系列分组之后（见 canvas-video-domain-cleanup-2026-08-08.md §8），没有
  // family 的模型会掉出所有分组、变成用户选不到的孤儿。
  [AI_MODELS.RODIN_GEN_2_5]: 'Rodin',
}

/** Get the model family for a model ID. */
export const getModelFamily = (modelId: string): string | null =>
  MODEL_FAMILIES[normalizeModelId(modelId)] ?? null

/**
 * 型号 —— 模型选择器**第二层**的分组键（`MODEL_FAMILIES` 是第一层「系列」）。
 *
 * 三层钻取（系列 → 型号 → 渠道）需要四个维度，其中**只有型号是新数据**，另外
 * 三个都已经存在：
 *
 * | 层 | 取自 |
 * | --- | --- |
 * | 1 系列 | `MODEL_FAMILIES` |
 * | 2 型号 | **本表** |
 * | 3 渠道 | `adapterType`（显示名走 `providerConfig.label`） |
 * | 端点（不露出） | `getVideoModelSendContract().referenceMode` |
 *
 * 「端点不露出」是这套结构的关键：`SEEDANCE_20` 与 `SEEDANCE_20_REFERENCE` 是
 * 两个不同端点，今天在选择器里各占一条；有了型号分组之后，用户只看见
 * 「Seedance 2.0」，走哪个端点由**节点上的模式**决定（关键帧 / 多图参考 /
 * 全能参考），reference 这个词不必出现在 UI 里。
 *
 * ⚠ 值**显式写死，不从 `AI_MODELS` 字符串推导**。推导规则会是「剥掉渠道后缀和
 * reference 后缀、但保留 fast」——`seedance-2.0-fast-reference-volcengine` 要剥
 * 两段留一段，再多一个型号就可能剥错。
 *
 * ⚠ 一个系列只有一个型号时（Veo / Gemini / HappyHorse / LTX / MiniMax），UI 应
 * **跳过第二层**直接进第三层，同 `BaseModelPickerPanel` 现有的 singleProvider
 * 处理，别为了结构对称让用户多点一次。
 *
 * 设计出处：`docs/plans/canvas-video-domain-cleanup-2026-08-08.md` §8。
 */
export const MODEL_VARIANTS: Record<string, string> = {
  // Seedance：型号 × 渠道 × 隐藏端点；2.0/2.5 均有三条渠道。
  [AI_MODELS.SEEDANCE_20]: 'seedance-2.0',
  [AI_MODELS.SEEDANCE_20_REFERENCE]: 'seedance-2.0',
  [AI_MODELS.SEEDANCE_20_VOLCENGINE]: 'seedance-2.0',
  [AI_MODELS.SEEDANCE_20_REFERENCE_VOLCENGINE]: 'seedance-2.0',
  [AI_MODELS.SEEDANCE_20_BYTEPLUS]: 'seedance-2.0',
  [AI_MODELS.SEEDANCE_20_REFERENCE_BYTEPLUS]: 'seedance-2.0',
  [AI_MODELS.SEEDANCE_20_FAST]: 'seedance-2.0-fast',
  [AI_MODELS.SEEDANCE_20_FAST_REFERENCE]: 'seedance-2.0-fast',
  [AI_MODELS.SEEDANCE_20_FAST_VOLCENGINE]: 'seedance-2.0-fast',
  [AI_MODELS.SEEDANCE_20_FAST_REFERENCE_VOLCENGINE]: 'seedance-2.0-fast',
  [AI_MODELS.SEEDANCE_20_FAST_BYTEPLUS]: 'seedance-2.0-fast',
  [AI_MODELS.SEEDANCE_20_FAST_REFERENCE_BYTEPLUS]: 'seedance-2.0-fast',
  [AI_MODELS.SEEDANCE_25]: 'seedance-2.5',
  [AI_MODELS.SEEDANCE_25_REFERENCE]: 'seedance-2.5',
  [AI_MODELS.SEEDANCE_25_VOLCENGINE]: 'seedance-2.5',
  [AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE]: 'seedance-2.5',
  [AI_MODELS.SEEDANCE_25_BYTEPLUS]: 'seedance-2.5',
  [AI_MODELS.SEEDANCE_25_REFERENCE_BYTEPLUS]: 'seedance-2.5',
  // Kling：两个型号各一条
  [AI_MODELS.KLING_V3_PRO]: 'kling-v3-pro',
  [AI_MODELS.KLING_O3_PRO]: 'kling-o3-pro',
  // MiniMax H3：4 个条目 = 1 型号 × 2 站（key 不通用）× 2 端点
  [AI_MODELS.MINIMAX_H3]: 'minimax-h3',
  [AI_MODELS.MINIMAX_H3_REFERENCE]: 'minimax-h3',
  [AI_MODELS.MINIMAX_H3_CN]: 'minimax-h3',
  [AI_MODELS.MINIMAX_H3_REFERENCE_CN]: 'minimax-h3',
  // Seedream（图片）：与 Seedance 同构 —— 同一型号在 fal 与火山各一条。
  // 不登记的话每个 id 自成型号，型号栏会并排出现「Seedream 5.0 Pro」与
  // 「Seedream 5.0 Pro（火山方舟）」两行（`deriveVariantLabels` 这时必须保留
  // 括注，否则一族里两行同名）—— 真机抓到的「相同模型跑了两遍」就是这个。
  [AI_MODELS.SEEDREAM_45]: 'seedream-4.5',
  [AI_MODELS.SEEDREAM_45_VOLCENGINE]: 'seedream-4.5',
  [AI_MODELS.SEEDREAM_50_PRO]: 'seedream-5.0-pro',
  [AI_MODELS.SEEDREAM_50_PRO_VOLCENGINE]: 'seedream-5.0-pro',
  [AI_MODELS.SEEDREAM_50_LITE]: 'seedream-5.0-lite',
  [AI_MODELS.SEEDREAM_50_LITE_VOLCENGINE]: 'seedream-5.0-lite',
  [AI_MODELS.SEEDREAM_50_VOLCENGINE]: 'seedream-5.0',
  // 单型号系列 —— 第二层会被跳过
  [AI_MODELS.VEO_31]: 'veo-3.1',
  [AI_MODELS.GEMINI_OMNI_FLASH]: 'gemini-omni-flash',
  [AI_MODELS.HAPPYHORSE_10]: 'happyhorse-1.1',
  // Base + reference share one 型号 — same split as the Seedance pair, so the
  // picker's second layer shows one Wan 3.0 entry, not two.
  [AI_MODELS.WAN_30]: 'wan-3.0',
  [AI_MODELS.WAN_30_REFERENCE]: 'wan-3.0',
  [AI_MODELS.LTX_23]: 'ltx-2.3',
}

/** Get the model variant (picker tier 2) for a model ID. */
export const getModelVariant = (modelId: string): string | null =>
  MODEL_VARIANTS[normalizeModelId(modelId)] ?? null

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
  [AI_MODELS.SEEDANCE_20_FAST_BYTEPLUS]: 1.75,
  [AI_MODELS.SEEDANCE_20]: 2,
  [AI_MODELS.SEEDANCE_20_VOLCENGINE]: 2.5,
  [AI_MODELS.SEEDANCE_20_BYTEPLUS]: 2.75,
  [AI_MODELS.HAPPYHORSE_10]: 3,
  [AI_MODELS.WAN_30]: 3.5,
  [AI_MODELS.VEO_31]: 4,
  [AI_MODELS.KLING_V3_PRO]: 5,
  [AI_MODELS.KLING_O3_PRO]: 5.5,
  [AI_MODELS.SEEDANCE_20_FAST_REFERENCE]: 6,
  [AI_MODELS.SEEDANCE_20_FAST_REFERENCE_VOLCENGINE]: 6.5,
  [AI_MODELS.SEEDANCE_20_FAST_REFERENCE_BYTEPLUS]: 6.75,
  [AI_MODELS.SEEDANCE_20_REFERENCE]: 7,
  [AI_MODELS.SEEDANCE_20_REFERENCE_VOLCENGINE]: 7.5,
  [AI_MODELS.SEEDANCE_20_REFERENCE_BYTEPLUS]: 7.75,
  [AI_MODELS.WAN_30_REFERENCE]: 7.9,
  [AI_MODELS.SEEDANCE_25]: 8,
  [AI_MODELS.SEEDANCE_25_VOLCENGINE]: 8.25,
  [AI_MODELS.SEEDANCE_25_BYTEPLUS]: 8.5,
  [AI_MODELS.SEEDANCE_25_REFERENCE]: 8.75,
  [AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE]: 9,
  [AI_MODELS.SEEDANCE_25_REFERENCE_BYTEPLUS]: 9.25,
  [AI_MODELS.LTX_23]: 10,
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
  | 'byteplus'
  | 'opensource'
  | 'replicate'
  | 'fish_audio'
  | 'elevenlabs'
  | 'hyper3d'
  | 'anthropic'
  | 'xai'
  | 'minimax'
  | 'runner'

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
  'byteplus',
  'minimax',
  'fish_audio',
  'elevenlabs',
  'opensource',
  'replicate',
  'runner',
  'hyper3d',
  'anthropic',
  'xai',
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
    case AI_ADAPTER_TYPES.BYTEPLUS:
      return 'byteplus'
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
    case AI_ADAPTER_TYPES.ANTHROPIC:
      return 'anthropic'
    case AI_ADAPTER_TYPES.XAI:
      return 'xai'
    // Both stations share one display group — users pick the station via the
    // model entry, not via a second heading in the picker.
    case AI_ADAPTER_TYPES.MINIMAX:
    case AI_ADAPTER_TYPES.MINIMAX_CN:
      return 'minimax'
    case AI_ADAPTER_TYPES.RUNNER:
      return 'runner'
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
