export const LORA_WORKBENCH_SECTIONS = {
  MINE: 'mine',
  TRAIN: 'train',
  COMMUNITY: 'community',
} as const

export type LoraWorkbenchSection =
  (typeof LORA_WORKBENCH_SECTIONS)[keyof typeof LORA_WORKBENCH_SECTIONS]

export const LORA_WORKBENCH_SECTION_VALUES = Object.values(
  LORA_WORKBENCH_SECTIONS,
)

export const DEFAULT_LORA_WORKBENCH_SECTION = LORA_WORKBENCH_SECTIONS.COMMUNITY

export const LORA_WORKBENCH_SEARCH_PARAM = 'section'

// ── 挂载可见性（M2a，docs/plans/lora-recipe-workflow.md）──────────────
// Studio chip 卡片 48px 缩略图请求宽度，96 覆盖 2x 屏。
export const LORA_CHIP_THUMBNAIL_WIDTH = 96
// 详细卡片来源图横滚条：图块 48×64，192 宽留出 2x + 裁切余量。
export const LORA_CARD_SOURCE_IMAGE_WIDTH = 192
// 挂载事件新鲜窗口：超过它的事件不再弹 toast（用户早已离开挂载现场）。
export const LORA_MOUNT_EVENT_FRESH_MS = 5 * 60 * 1000
// 挂载后触发按钮的高亮时长。
export const LORA_MOUNT_PULSE_MS = 4000

export const CIVITAI_LORA_PAGE_SIZE = 10

export const MODEL_KEYWORD_LORA_KEYWORD_RAW_URL =
  'https://raw.githubusercontent.com/mix1009/model-keyword/main/lora-keyword.txt'

export const MODEL_KEYWORD_LORA_QUERY_MIN_LENGTH = 2

export const MODEL_KEYWORD_LORA_RESULT_LIMIT = 12

export const MODEL_KEYWORD_LORA_FETCH_TIMEOUT_MS = 8000

// Base model options exposed in the LoRA training form. `available: false`
// shows the option as "Coming Soon" so users see the roadmap but can't
// submit a job we don't have a trainer for. Add a Replicate/fal trainer
// route in lora-training.service.ts when flipping `available: true`.
export const LORA_TRAINING_BASE_MODELS = [
  {
    id: 'flux-1-d',
    label: 'FLUX.1 D',
    available: true,
    descriptionKey: 'baseModelFluxDescription',
  },
  {
    id: 'sdxl-1.0',
    label: 'SDXL 1.0',
    available: false,
    descriptionKey: 'baseModelSdxlDescription',
  },
  {
    id: 'illustrious',
    label: 'Illustrious',
    available: false,
    descriptionKey: 'baseModelIllustriousDescription',
  },
] as const

export type LoraTrainingBaseModel =
  (typeof LORA_TRAINING_BASE_MODELS)[number]['id']

export const LORA_TRAINING_BASE_MODEL_VALUES = LORA_TRAINING_BASE_MODELS.map(
  (m) => m.id,
) as readonly LoraTrainingBaseModel[]

export const DEFAULT_LORA_TRAINING_BASE_MODEL: LoraTrainingBaseModel =
  'flux-1-d'

export const CIVITAI_LORA_SORT_VALUES = [
  'Highest Rated',
  'Most Downloaded',
  'Newest',
] as const

export type CivitaiLoraSort = (typeof CIVITAI_LORA_SORT_VALUES)[number]

export const CIVITAI_LORA_SORT_OPTIONS = [
  { value: 'Highest Rated', labelKey: 'sortHighestRated' },
  { value: 'Most Downloaded', labelKey: 'sortMostDownloaded' },
  { value: 'Newest', labelKey: 'sortNewest' },
] as const satisfies readonly {
  value: CivitaiLoraSort
  labelKey: string
}[]

// 顺序决定 UI 上 filter chip 的展示顺序：Illustrious 排在最前（我们的首选
// anime 路径），然后是 Flux / SDXL 这些有 native 端点的，最后是只能跳走的
// Pony / SD 1.5 / Anima。
export const CIVITAI_LORA_BASE_MODEL_VALUES = [
  'all',
  'Illustrious',
  'Flux.1 D',
  'SDXL 1.0',
  'Pony',
  'SD 1.5',
  'Anima',
] as const

export type CivitaiLoraBaseModel =
  (typeof CIVITAI_LORA_BASE_MODEL_VALUES)[number]

// Civitai 的 `baseModels` 过滤参数有 coverage bug：传 `baseModels=Illustrious`
// 时会漏掉很多 modelVersions[].baseModel === 'Illustrious' 的 LoRA（实测搜
// "Wuthering Waves" 时 30 → 4，丢 80%）。所以我们不传 baseModels 给 Civitai，
// 改成 over-fetch + 客户端按 family bucket 过滤。
//
// 每个 family 对应一组 Civitai 上常见的 baseModel 字符串，组内 LoRA 在推理时
// 可以互相兼容（共享底模架构），所以视为一个 family。
export const CIVITAI_BASE_MODEL_FAMILY_MEMBERS = {
  // NoobAI 是 Illustrious 衍生的 finetune，权重结构兼容，可共用 Replicate
  // delta-lock/noobai-xl 端点。
  Illustrious: ['Illustrious', 'NoobAI'],
  'Flux.1 D': ['Flux.1 D', 'Flux.1 S'],
  'SDXL 1.0': ['SDXL 1.0', 'SDXL 0.9', 'SDXL Turbo'],
  Pony: ['Pony'],
  'SD 1.5': ['SD 1.5', 'SD 1.5 LCM'],
  Anima: ['Anima'],
} as const satisfies Record<
  Exclude<CivitaiLoraBaseModel, 'all'>,
  readonly string[]
>

// 每个 base model family 在 PixelVault 上能不能跑生成：
//   - 'native':   有 native 端点，用户能在 PixelVault 内部生成
//   - 'external': 没有可用端点（权重结构不兼容 / license 限制 / 缺端点），
//                 引导用户去 Civitai 自己跑
//
// 判断依据：
//   Illustrious / SDXL 1.0：跑 delta-lock/noobai-xl (Replicate)，已验证
//   Flux.1 D：跑 fal-ai/flux-lora，已验证
//   Pony：权重命名跟 Illustrious 差异较大，跑 NoobAI 端点会报 PEFT 错误
//   SD 1.5：项目没有 SD 1.5 推理端点
//   Anima：作者 license 不授权第三方平台推理（Civitai 上 allowCommercialUse
//          普遍不含 'Rent'），且没有可用 anime checkpoint 端点
type CivitaiBaseModelGeneratability = 'native' | 'external'

export const CIVITAI_BASE_MODEL_GENERATABILITY = {
  Illustrious: 'native',
  'Flux.1 D': 'native',
  'SDXL 1.0': 'native',
  Pony: 'external',
  'SD 1.5': 'external',
  Anima: 'external',
} as const satisfies Record<
  Exclude<CivitaiLoraBaseModel, 'all'>,
  CivitaiBaseModelGeneratability
>

/**
 * 判断一个 LoRA 的 baseModel 字符串能不能在 PixelVault 内部生成。接受 Civitai
 * 返回的原始 baseModel（如 'Illustrious'、'NoobAI'、'Flux.1 D' 等），自动映射
 * 到 family bucket 后查 generatability。
 */
export function isCivitaiBaseModelGeneratable(rawBaseModel: string): boolean {
  for (const [family, members] of Object.entries(
    CIVITAI_BASE_MODEL_FAMILY_MEMBERS,
  )) {
    if ((members as readonly string[]).includes(rawBaseModel)) {
      return (
        CIVITAI_BASE_MODEL_GENERATABILITY[
          family as Exclude<CivitaiLoraBaseModel, 'all'>
        ] === 'native'
      )
    }
  }
  return false
}

// 训练预设 — 给「我想训一个 X」的用户一个不用调任何 dial 的入口。点一张卡，
// 表单的 loraType / baseModel / 默认 triggerWord 一起被填上，用户只需要上传图
// 和起名字。3 列 × 2 行 = 6 张刚好填满桌面端。
//
// id 是稳定 key（i18n 名字按 nameKey 取）。`available: false` 的卡渲染成
// Coming Soon tooltip，点击不会触发 onSelect — 跟 LORA_TRAINING_BASE_MODELS
// 同一套门控逻辑。新增 preset 时如果 baseModel 不是 'flux-1-d'，要先把
// service 层的 trainer 端点接上再 flip available。
export const LORA_TRAINING_PRESETS = [
  {
    id: 'anime-character',
    available: true,
    loraType: 'subject',
    baseModel: 'flux-1-d',
    suggestedTriggerWord: 'sks_character',
    nameKey: 'presetAnimeCharacterName',
    descriptionKey: 'presetAnimeCharacterDescription',
    explanationKey: 'presetAnimeCharacterExplanation',
    icon: 'sparkles',
  },
  {
    id: 'realistic-portrait',
    available: true,
    loraType: 'subject',
    baseModel: 'flux-1-d',
    suggestedTriggerWord: 'sks_person',
    nameKey: 'presetRealisticPortraitName',
    descriptionKey: 'presetRealisticPortraitDescription',
    explanationKey: 'presetRealisticPortraitExplanation',
    icon: 'user',
  },
  {
    id: 'art-style',
    available: true,
    loraType: 'style',
    baseModel: 'flux-1-d',
    suggestedTriggerWord: 'sks_style',
    nameKey: 'presetArtStyleName',
    descriptionKey: 'presetArtStyleDescription',
    explanationKey: 'presetArtStyleExplanation',
    icon: 'palette',
  },
  {
    id: 'object',
    available: true,
    loraType: 'subject',
    baseModel: 'flux-1-d',
    suggestedTriggerWord: 'sks_object',
    nameKey: 'presetObjectName',
    descriptionKey: 'presetObjectDescription',
    explanationKey: 'presetObjectExplanation',
    icon: 'box',
  },
  {
    id: 'sdxl-coming-soon',
    available: false,
    loraType: 'subject',
    baseModel: 'sdxl-1.0',
    suggestedTriggerWord: '',
    nameKey: 'presetSdxlName',
    descriptionKey: 'presetSdxlDescription',
    explanationKey: 'presetSdxlExplanation',
    icon: 'image',
  },
  {
    id: 'illustrious-coming-soon',
    available: false,
    loraType: 'subject',
    baseModel: 'illustrious',
    suggestedTriggerWord: '',
    nameKey: 'presetIllustriousName',
    descriptionKey: 'presetIllustriousDescription',
    explanationKey: 'presetIllustriousExplanation',
    icon: 'wand',
  },
] as const satisfies readonly {
  id: string
  available: boolean
  loraType: 'subject' | 'style'
  baseModel: LoraTrainingBaseModel
  suggestedTriggerWord: string
  nameKey: string
  descriptionKey: string
  explanationKey: string
  icon: 'sparkles' | 'user' | 'palette' | 'box' | 'image' | 'wand'
}[]

export type LoraTrainingPreset = (typeof LORA_TRAINING_PRESETS)[number]
export type LoraTrainingPresetId = LoraTrainingPreset['id']

export function getLoraTrainingPreset(
  id: LoraTrainingPresetId,
): LoraTrainingPreset | undefined {
  return LORA_TRAINING_PRESETS.find((p) => p.id === id)
}

export function isLoraWorkbenchSection(
  value: string | null,
): value is LoraWorkbenchSection {
  return (
    typeof value === 'string' &&
    (LORA_WORKBENCH_SECTION_VALUES as readonly string[]).includes(value)
  )
}

export function isCivitaiLoraSort(value: string): value is CivitaiLoraSort {
  return (CIVITAI_LORA_SORT_VALUES as readonly string[]).includes(value)
}

export function isCivitaiLoraBaseModel(
  value: string,
): value is CivitaiLoraBaseModel {
  return (CIVITAI_LORA_BASE_MODEL_VALUES as readonly string[]).includes(value)
}
