import type { AspectRatio } from '@/constants/config'

export const LORA_WORKBENCH_SECTIONS = {
  // GENERATE 是新一等 surface（LoRA 域拥有生成，见 lora-domain-split）。
  // mine/community 保留为「库」tab 的两个子态（公开/我的），深链不破坏。
  GENERATE: 'generate',
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

// D7③：生成页结果历史 filmstrip 的会话级上限。超过后 FIFO 丢最旧一张——
// 只在内存里存本会话结果，刷新清空（正片在素材库/画廊里另有长期归档）。
export const LORA_RESULT_HISTORY_MAX = 12

// P1-10（D7①）：生成页比例 chip 的值域与展示顺序。LoRA 出图主流是 3:4 立绘，
// 故 3:4 紧跟 1:1 排在前面（与 Studio 的 STUDIO_IMAGE_ASPECT_RATIOS 值域相同、
// 顺序不同——LoRA 域偏向竖构图）。默认值仍是 1:1，见 DEFAULT_ASPECT_RATIO。
export const LORA_GENERATE_ASPECT_RATIOS = [
  '1:1',
  '3:4',
  '4:3',
  '16:9',
  '9:16',
] as const satisfies readonly AspectRatio[]

// ── 库筛选深链（P1-5 方案 A）────────────────────────────────────────────
// family/q/sort/nsfw 全部入 URL query，与上面的 section 参数同一套「默认值
// 不入 URL」约定：值等于默认时从 query 里删掉，保持深链干净。
export const LORA_LIBRARY_FAMILY_PARAM = 'family'
export const LORA_LIBRARY_SEARCH_PARAM = 'q'
export const LORA_LIBRARY_SORT_PARAM = 'sort'
export const LORA_LIBRARY_NSFW_PARAM = 'nsfw'

// ── 挂载可见性（M2a，docs/plans/lora-recipe-workflow.md）──────────────
// Studio chip 卡片 48px 缩略图请求宽度，96 覆盖 2x 屏。
export const LORA_CHIP_THUMBNAIL_WIDTH = 96
// 详细卡片来源图横滚条：图块 48×64，192 宽留出 2x + 裁切余量。
export const LORA_CARD_SOURCE_IMAGE_WIDTH = 192
// 挂载事件新鲜窗口：超过它的事件不再弹 toast（用户早已离开挂载现场）。
export const LORA_MOUNT_EVENT_FRESH_MS = 5 * 60 * 1000
// 挂载后触发按钮的高亮时长。
export const LORA_MOUNT_PULSE_MS = 4000
// LoRA 域 toast 统一停留时长（P2-2：此前部分 toast 无显式 duration，
// 观察到停留 >30s 不消失；显式设置消灭歧义）。
export const LORA_TOAST_DURATION_MS = 4000

// 收藏自愈回填：单次列表请求最多回填几行（每行一次 Civitai 请求，
// 限量避免旧收藏多的用户首次加载被拖慢；剩余行下次请求继续愈合）。
export const LORA_CIVITAI_BACKFILL_MAX_PER_REQUEST = 3

// 配方 extras 自动定位全部失败时的逃生口：跳 Civitai 站内搜索让用户自查。
export const CIVITAI_MODEL_SEARCH_URL = 'https://civitai.com/search/models'

// P2-6：10 条/页在 2xl:6 列网格下永远残行；12 在 6/4/3/2 列下都能整行
// （5 列容忍最后一行留 2 空位）。
export const CIVITAI_LORA_PAGE_SIZE = 12

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
// Pony / SD 1.5 / Anima / 新家族。
//
// 2026-07-07 与 Civitai 全量 base model 清单对齐（数据驱动：按 meilisearch
// estimatedTotalHits 实测供给，≥1000 个 LoRA 的家族才配 named chip，其余全部
// 落进 'other' 兜底桶——保证任何 Civitai baseModel 值都可被过滤到，无枚举
// 遗漏）。实测（2026-07-07）：Z-Image 系 ~9.3k · NoobAI 8.4k（并入
// Illustrious 桶）· Qwen 1.7k · Chroma 1.1k；Flux.2 D 111 / Pony V7 65 /
// HiDream 65 / SD 3.5 ≈0 → 'other'。视频家族（Wan/Hunyuan Video 等）也归
// 'other'——本库是图像 LoRA 场景，不为视频家族占 chip 位。
export const CIVITAI_LORA_BASE_MODEL_VALUES = [
  'all',
  'Illustrious',
  'Flux.1 D',
  'SDXL 1.0',
  'Pony',
  'SD 1.5',
  'Anima',
  'Qwen',
  'Z-Image',
  'Chroma',
  'other',
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
  // Flux.1 Krea 是 Flux.1 dev 的同架构 drop-in 变体，LoRA 互通。
  'Flux.1 D': ['Flux.1 D', 'Flux.1 S', 'Flux.1 Krea'],
  // Lightning/Hyper/LCM 是 SDXL 1.0 的蒸馏/加速变体，LoRA 权重结构同源。
  'SDXL 1.0': [
    'SDXL 1.0',
    'SDXL 0.9',
    'SDXL Turbo',
    'SDXL Lightning',
    'SDXL Hyper',
    'SDXL 1.0 LCM',
  ],
  // 只收 SDXL 架构的 V6 系；Pony V7 是 AuraFlow 架构、权重不通，归 'other'。
  Pony: ['Pony'],
  'SD 1.5': ['SD 1.5', 'SD 1.5 LCM', 'SD 1.5 Hyper', 'SD 1.4'],
  Anima: ['Anima'],
  Qwen: ['Qwen'],
  // Turbo 是 Z-Image 的蒸馏版，浏览归同一家族桶（Civitai 上供给以 Turbo 为主）。
  'Z-Image': ['ZImageBase', 'ZImageTurbo'],
  Chroma: ['Chroma'],
} as const satisfies Record<
  Exclude<CivitaiLoraBaseModel, 'all' | 'other'>,
  readonly string[]
>

// 'other' 兜底桶的判定集合：不属于任何 named family 的 baseModel 都算 other。
export const CIVITAI_NAMED_BASE_MODEL_MEMBER_SET: ReadonlySet<string> = new Set(
  Object.values(CIVITAI_BASE_MODEL_FAMILY_MEMBERS).flat(),
)

// Civitai REST can filter by explicit baseModels but cannot express NOT IN.
// Keep the full complement check in service code, and use this curated long-tail
// set only to keep the "other" browse path from scanning broad all-model pages.
export const CIVITAI_OTHER_BASE_MODEL_MEMBERS = [
  'Pony V7',
  'Flux.2 D',
  'Flux.2 S',
  'HiDream',
  'SD 3.5',
  'SD 3',
  'SD 2.1',
  'SD 2.0',
  'AuraFlow',
  'Kolors',
  'PixArt a',
  'PixArt E',
  'Wan Video 14B t2v',
  'Wan Video 14B i2v 480p',
  'Wan Video 14B i2v 720p',
  'Hunyuan Video',
  'LTXV',
  'Mochi',
  'CogVideoX',
] as const

// 每个 base model family 在 PixelVault 上能不能跑生成：
//   - 'native':   有 native 端点，用户能在 PixelVault 内部生成
//   - 'external': 没有可用端点（权重结构不兼容 / license 限制 / 缺端点），
//                 引导用户去 Civitai 自己跑
//
// 判断依据：
//   Illustrious / SDXL 1.0：跑 delta-lock/noobai-xl (Replicate)，已验证
//   Flux.1 D：跑 fal-ai/flux-lora，已验证
//   Pony：Comfy Runner（RunPod）跑 Pony Diffusion V6 XL checkpoint，忠实复刻
//   SD 1.5：项目没有 SD 1.5 推理端点（runner 范围也不含，见 HANDOFF §4.2b）
//   Anima：作者 license 不授权第三方托管 hosted 端点，但 Comfy Runner 自建
//          环境跑同一 checkpoint 不受此限制，已转 native
//
// Pony / Anima 2026-07 随 comfy runner（RunPod）交付翻转为 native，见
// docs/plans/comfy-runner-HANDOFF-2026-07.md §4.2b。实际可生成性仍受
// FEATURE_FLAGS.comfyRunner 门控——flag 关闭时对应 AI_MODELS.available 为
// false，isCivitaiBaseModelGeneratable() 只反映"有 native 路径"，不代表
// flag 已开。
type CivitaiBaseModelGeneratability = 'native' | 'external'

export const CIVITAI_BASE_MODEL_GENERATABILITY = {
  Illustrious: 'native',
  'Flux.1 D': 'native',
  'SDXL 1.0': 'native',
  Pony: 'native',
  'SD 1.5': 'external',
  Anima: 'native',
  Qwen: 'external',
  'Z-Image': 'external',
  Chroma: 'external',
} as const satisfies Record<
  Exclude<CivitaiLoraBaseModel, 'all' | 'other'>,
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
          family as Exclude<CivitaiLoraBaseModel, 'all' | 'other'>
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

// P1-6（2026-07-04 三态分级；2026-07-06 owner 改回默认 safe）：
//   safe         — 默认。civitai `nsfw=false` + 名称词表兜底，封面/模型都干净。
//   unrestricted — 安全 + NSFW 混着显示，不额外过滤，封面放到 XXX。
//   nsfwOnly     — 仅 NSFW：过滤掉安全内容，只留 NSFW 内容。
// 数组顺序即 UI 循环点击顺序：unrestricted → nsfwOnly → safe → unrestricted；
// 默认从 safe 起步，首次点击进入 unrestricted。
export const LORA_NSFW_FILTER_VALUES = [
  'unrestricted',
  'nsfwOnly',
  'safe',
] as const

export type LoraNsfwFilter = (typeof LORA_NSFW_FILTER_VALUES)[number]

export const DEFAULT_LORA_NSFW_FILTER: LoraNsfwFilter = 'safe'

export function isLoraNsfwFilter(value: string): value is LoraNsfwFilter {
  return (LORA_NSFW_FILTER_VALUES as readonly string[]).includes(value)
}

// Issue C（docs/plans/lora-search-image-audit-2026-07.md）：civitai 搜索有
// 两条互不兼容的分页范式——meilisearch 走 offset（client 用 page 号算
// offset）、REST 回落走 cursor scan（client 用 cursorByPageRef 记录服务端
// 发的 cursor）。服务端 listCivitaiLoras 每次请求独立决定走哪条，中途从
// meilisearch 切到 REST（或反之）会让 page 号与 cursor map 不再自洽，翻页
// 出现重复/错位页。修复：一次搜索会话内锁定后端——首页决定用哪条，后续页
// 把锁定结果回传给服务端（这个 type），服务端据此跳过另一条、不再中途切。
export const CIVITAI_SEARCH_BACKEND_VALUES = ['meilisearch', 'rest'] as const

export type CivitaiSearchBackend =
  (typeof CIVITAI_SEARCH_BACKEND_VALUES)[number]

export function isCivitaiSearchBackend(
  value: string,
): value is CivitaiSearchBackend {
  return (CIVITAI_SEARCH_BACKEND_VALUES as readonly string[]).includes(value)
}

// P1-6：安全档下，civitai `nsfw=false` 已经把 NSFW 分级的封面挡成占位卡——
// 但模型名本身还在（比如标题带 "Hentai"），留着只剩一张无信息量的空卡。
// 名称词表按小写子串匹配，只过滤"这名字本身就是 NSFW 标签"的场景，不做
// 内容层面的判断（内容层面已经交给 civitai 的 nsfwLevel）。
export const LORA_NSFW_NAME_KEYWORDS = [
  'hentai',
  'nsfw',
  'r18',
  'r-18',
  'porn',
  'nudity',
  'nude',
  'ecchi',
  'lewd',
] as const

export function isNsfwNamedModel(name: string): boolean {
  const haystack = name.toLowerCase()
  return LORA_NSFW_NAME_KEYWORDS.some((keyword) => haystack.includes(keyword))
}
