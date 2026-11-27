import { AI_MODELS } from './models/enum'

export const NOVELAI_V5_MAX_CHARACTERS = 22

/**
 * V4 / V4.5 的角色上限与落位方式：最多 6 人，位置只能落在 5×5 网格的格心上。
 * V5 才是「≤22 人自由定位」。
 * https://docs.novelai.net/en/image/multiplecharacters/
 */
export const NOVELAI_V45_MAX_CHARACTERS = 6
export const NOVELAI_CHARACTER_GRID_SIZE = 5

/**
 * 角色构图的两种形态。⚠ **按模型能力切，⛔ 不给用户选**（D10 ④）——
 * 同一块控件换一种落位方式，⛔ 不做两个组件。
 */
export const NOVELAI_CHARACTER_LAYOUT_MODES = ['free', 'grid'] as const
export type NovelAiCharacterLayoutMode =
  (typeof NOVELAI_CHARACTER_LAYOUT_MODES)[number]

export const NOVELAI_PRECISE_REFERENCE_KINDS = [
  'character',
  'style',
  'character&style',
  'outfit',
] as const
export type NovelAiPreciseReferenceKind =
  (typeof NOVELAI_PRECISE_REFERENCE_KINDS)[number]

/** 每张精确参考图额外消耗的 Anlas（官方按张线性叠加）。 */
export const NOVELAI_PRECISE_REFERENCE_ANLAS_EACH = 5

/** 单次请求允许叠加的精确参考张数上限（核自 `novelai.net` 模块 `39706.Y = 16`）。 */
export const NOVELAI_MAX_PRECISE_REFERENCES = 16

/**
 * V4.5 精确参考官方三档比例分桶（核自 `novelai.net` 模块 `108295` `tE` / `134691.F`）：
 * 黑边 contain 垫齐到竖 `1024×1536`、横 `1536×1024`、方 `1472×1472`。
 */
export const NOVELAI_PRECISE_REFERENCE_BUCKETS = {
  portrait: { orientation: 'portrait', width: 1024, height: 1536 },
  landscape: { orientation: 'landscape', width: 1536, height: 1024 },
  square: { orientation: 'square', width: 1472, height: 1472 },
} as const satisfies Record<
  NovelAiResolutionOrientation,
  {
    readonly orientation: NovelAiResolutionOrientation
    readonly width: number
    readonly height: number
  }
>

export type NovelAiPreciseReferenceBucket =
  (typeof NOVELAI_PRECISE_REFERENCE_BUCKETS)[NovelAiResolutionOrientation]

const PRECISE_REFERENCE_BUCKET_LIST: readonly NovelAiPreciseReferenceBucket[] =
  [
    NOVELAI_PRECISE_REFERENCE_BUCKETS.portrait,
    NOVELAI_PRECISE_REFERENCE_BUCKETS.landscape,
    NOVELAI_PRECISE_REFERENCE_BUCKETS.square,
  ]

/**
 * V5 精确参考官方 97 档约 1MP 分桶表（核自 `novelai.net` 模块 `589161` `E`）：
 * 按最小对数比例差挑桶后做 cover 缩放 + 居中裁切（不垫黑边）。
 */
export const NOVELAI_V5_PRECISE_REFERENCE_BUCKETS: readonly (readonly [
  number,
  number,
])[] = [
  [256, 4096],
  [256, 4032],
  [256, 3968],
  [256, 3904],
  [256, 3840],
  [256, 3776],
  [256, 3712],
  [256, 3648],
  [256, 3584],
  [256, 3520],
  [256, 3456],
  [256, 3392],
  [256, 3328],
  [320, 3264],
  [320, 3200],
  [320, 3136],
  [320, 3072],
  [320, 3008],
  [320, 2944],
  [320, 2880],
  [320, 2816],
  [320, 2752],
  [384, 2688],
  [384, 2624],
  [384, 2560],
  [384, 2496],
  [384, 2432],
  [384, 2368],
  [448, 2304],
  [448, 2240],
  [448, 2176],
  [448, 2112],
  [512, 2048],
  [512, 1984],
  [512, 1920],
  [512, 1856],
  [576, 1792],
  [576, 1728],
  [576, 1664],
  [640, 1600],
  [640, 1536],
  [704, 1472],
  [704, 1408],
  [768, 1344],
  [768, 1280],
  [832, 1216],
  [896, 1152],
  [960, 1088],
  [1024, 1024],
  [1088, 960],
  [1152, 896],
  [1216, 832],
  [1280, 768],
  [1344, 768],
  [1408, 704],
  [1472, 704],
  [1536, 640],
  [1600, 640],
  [1664, 576],
  [1728, 576],
  [1792, 576],
  [1856, 512],
  [1920, 512],
  [1984, 512],
  [2048, 512],
  [2112, 448],
  [2176, 448],
  [2240, 448],
  [2304, 448],
  [2368, 384],
  [2432, 384],
  [2496, 384],
  [2560, 384],
  [2624, 384],
  [2688, 384],
  [2752, 320],
  [2816, 320],
  [2880, 320],
  [2944, 320],
  [3008, 320],
  [3072, 320],
  [3136, 320],
  [3200, 320],
  [3264, 320],
  [3328, 256],
  [3392, 256],
  [3456, 256],
  [3520, 256],
  [3584, 256],
  [3648, 256],
  [3712, 256],
  [3776, 256],
  [3840, 256],
  [3904, 256],
  [3968, 256],
  [4032, 256],
  [4096, 256],
] as const

/**
 * 为 V4.5 精确参考挑选三档黑边分桶（与官方 `134691.F` 一致：最小化线性比例差）。
 * 宽高非法时回落到方图桶 `1472×1472`。
 */
export function pickNovelAiPreciseReferenceBucket(
  width: number,
  height: number,
): NovelAiPreciseReferenceBucket {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return NOVELAI_PRECISE_REFERENCE_BUCKETS.square
  }
  const ratio = width / height
  let best: NovelAiPreciseReferenceBucket = PRECISE_REFERENCE_BUCKET_LIST[0]!
  let bestDistance = Math.abs(best.width / best.height - ratio)
  for (const bucket of PRECISE_REFERENCE_BUCKET_LIST) {
    const distance = Math.abs(bucket.width / bucket.height - ratio)
    if (distance < bestDistance) {
      best = bucket
      bestDistance = distance
    }
  }
  return best
}

/**
 * 为 V5 精确参考挑选 97 档分桶（与官方 `589161.f` 逐字一致：最小化对数比例差）。
 * 宽高非法时回落到 `1024×1024`。
 */
export function pickNovelAiV5PreciseReferenceBucket(
  width: number,
  height: number,
): { readonly width: number; readonly height: number } {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return { width: 1024, height: 1024 }
  }
  const targetLogRatio = Math.log(Math.max(width, 1) / Math.max(height, 1))
  let best = NOVELAI_V5_PRECISE_REFERENCE_BUCKETS[0]!
  let bestDistance = Math.abs(targetLogRatio - Math.log(best[0] / best[1]))
  for (const bucket of NOVELAI_V5_PRECISE_REFERENCE_BUCKETS) {
    const distance = Math.abs(targetLogRatio - Math.log(bucket[0] / bucket[1]))
    if (distance < bestDistance) {
      best = bucket
      bestDistance = distance
    }
  }
  return { width: best[0], height: best[1] }
}

/** 按目标型号的预处理契约返回精确参考目标画布尺寸与贴合方式。 */
export function pickNovelAiPreciseReferenceTarget(
  width: number,
  height: number,
  modelId?: string,
): {
  readonly width: number
  readonly height: number
  readonly fit: 'contain' | 'cover'
} {
  const mode = getNovelAiPreciseReferenceContract(modelId)?.preprocessMode
  if (mode === 'bucket-97-cover') {
    const bucket = pickNovelAiV5PreciseReferenceBucket(width, height)
    return { width: bucket.width, height: bucket.height, fit: 'cover' }
  }
  const bucket = pickNovelAiPreciseReferenceBucket(width, height)
  return { width: bucket.width, height: bucket.height, fit: 'contain' }
}

export function getNovelAiPreciseReferenceAnlasCost(count: number): number {
  if (!Number.isFinite(count) || count <= 0) return 0
  return Math.floor(count) * NOVELAI_PRECISE_REFERENCE_ANLAS_EACH
}

export interface NovelAiNumericRange {
  readonly min: number
  readonly max: number
  readonly step: number
  readonly default: number
}

export type NovelAiPreciseReferencePreprocessMode =
  | 'letterbox-3tier'
  | 'bucket-97-cover'

export interface NovelAiPreciseReferenceContract {
  /**
   * 线格式（`director_reference_*` JSON 字段）是否已通过真实抓包 / 官方客户端实证。
   * ⛔ 未实证前不得向 provider 发送，避免猜测字段导致线上 400 或静默失效。
   */
  readonly wireVerified: boolean
  readonly kinds: readonly NovelAiPreciseReferenceKind[]
  readonly strength: NovelAiNumericRange
  /** V4.5 有 fidelity（发送时翻为 `1 - fidelity`）；V5 无 fidelity 控件，发送 `0`（等价 `fidelity = 1`）。 */
  readonly fidelity?: NovelAiNumericRange
  readonly supportsPreferSameOutfit: boolean
  /** 核自 `novelai.net` 模块 `425888` (`charRefInpainting`)：V4.5 支持，V5 不支持。 */
  readonly canCombineWithInpaint: boolean
  /** V4.5 官方说明多张角色参考会混成同一个人；V5 支持多角色叠加。 */
  readonly supportsMultiCharacter: boolean
  readonly preprocessMode: NovelAiPreciseReferencePreprocessMode
  readonly maxCount: number
}

export interface NovelAiModelContract {
  readonly generation: 'v4.5' | 'v5'
  readonly characterLayoutMode: NovelAiCharacterLayoutMode
  readonly maxCharacters: number
  readonly textLimit: { readonly maxChars: number; readonly latinOnly: boolean }
  readonly inpaintModelId: string
  readonly inpaintFallsBack: boolean
  readonly defaultGuidanceScale: number
  readonly isMediumEffort: boolean
  readonly preciseReference: NovelAiPreciseReferenceContract | null
}

/** 核自 `novelai.net` 模块 `425888` / `134691` / `09aajvaad_e63`（2026-11-26）。 */
const V45_PRECISE_REFERENCE_CONTRACT: NovelAiPreciseReferenceContract = {
  wireVerified: true,
  kinds: ['character', 'style', 'character&style'],
  strength: { min: 0, max: 1, step: 0.05, default: 1 },
  fidelity: { min: 0, max: 1, step: 0.05, default: 1 },
  supportsPreferSameOutfit: false,
  canCombineWithInpaint: true,
  supportsMultiCharacter: false,
  preprocessMode: 'letterbox-3tier',
  maxCount: NOVELAI_MAX_PRECISE_REFERENCES,
}

/**
 * V5 精确参考契约（2026-11-26 核自 `novelai.net/image` 线上客户端模块 `39706` / `425888` / `589161` / `09aajvaad_e63`）：
 * - `outfit` 线上 `base_caption` 为 `"costume"`；`Prefer same outfit` 编码在 `base_caption` 内
 *   （`character` ↔ `character_mainoutfit`、`character&style` ↔ `character&style_anyoutfit`）。
 * - 无 fidelity 控件，`director_reference_secondary_strength_values` 固定发 `0`；强度 `0–5`（步进 `0.05`）。
 * - `charRefInpainting: false`（不与重绘叠加）；使用 97 档约 1MP `cover+crop` 分桶。
 */
const V5_PRECISE_REFERENCE_CONTRACT: NovelAiPreciseReferenceContract = {
  wireVerified: true,
  kinds: ['character', 'style', 'character&style', 'outfit'],
  strength: { min: 0, max: 5, step: 0.05, default: 1 },
  supportsPreferSameOutfit: true,
  canCombineWithInpaint: false,
  supportsMultiCharacter: true,
  preprocessMode: 'bucket-97-cover',
  maxCount: NOVELAI_MAX_PRECISE_REFERENCES,
}

/**
 * NovelAI 全部五档在架模型的单一能力真相表。
 * UI、卡片总线、服务端校验、Execution Worker 与模型提示均由此表派生，⛔ 不再散落 `if (isV5)`。
 */
export const NOVELAI_GENERATION_CONTRACT: Readonly<
  Record<string, NovelAiModelContract>
> = {
  [AI_MODELS.NOVELAI_V45_FULL]: {
    generation: 'v4.5',
    characterLayoutMode: 'grid',
    maxCharacters: NOVELAI_V45_MAX_CHARACTERS,
    textLimit: { maxChars: 118, latinOnly: true },
    inpaintModelId: 'nai-diffusion-4-5-full-inpainting',
    inpaintFallsBack: false,
    defaultGuidanceScale: 5,
    isMediumEffort: false,
    preciseReference: V45_PRECISE_REFERENCE_CONTRACT,
  },
  [AI_MODELS.NOVELAI_V45_CURATED]: {
    generation: 'v4.5',
    characterLayoutMode: 'grid',
    maxCharacters: NOVELAI_V45_MAX_CHARACTERS,
    textLimit: { maxChars: 118, latinOnly: true },
    inpaintModelId: 'nai-diffusion-4-5-curated-inpainting',
    inpaintFallsBack: false,
    defaultGuidanceScale: 5,
    isMediumEffort: false,
    preciseReference: V45_PRECISE_REFERENCE_CONTRACT,
  },
  [AI_MODELS.NOVELAI_V5_FULL]: {
    generation: 'v5',
    characterLayoutMode: 'free',
    maxCharacters: NOVELAI_V5_MAX_CHARACTERS,
    textLimit: { maxChars: 750, latinOnly: false },
    inpaintModelId: 'nai-diffusion-5-full-inpainting',
    inpaintFallsBack: false,
    defaultGuidanceScale: 4,
    isMediumEffort: false,
    preciseReference: V5_PRECISE_REFERENCE_CONTRACT,
  },
  [AI_MODELS.NOVELAI_V5_FULL_MEDIUM]: {
    generation: 'v5',
    characterLayoutMode: 'free',
    maxCharacters: NOVELAI_V5_MAX_CHARACTERS,
    textLimit: { maxChars: 750, latinOnly: false },
    inpaintModelId: 'nai-diffusion-5-full-medium-inpainting',
    inpaintFallsBack: false,
    defaultGuidanceScale: 4,
    isMediumEffort: true,
    preciseReference: null,
  },
  [AI_MODELS.NOVELAI_V5_CURATED]: {
    generation: 'v5',
    characterLayoutMode: 'free',
    maxCharacters: NOVELAI_V5_MAX_CHARACTERS,
    textLimit: { maxChars: 374, latinOnly: false },
    // 网页端将 V5 Curated 重绘映射到 V4.5 Curated inpaint 模型（实打实的回落）。
    inpaintModelId: 'nai-diffusion-4-5-curated-inpainting',
    inpaintFallsBack: true,
    defaultGuidanceScale: 4,
    isMediumEffort: false,
    preciseReference: V5_PRECISE_REFERENCE_CONTRACT,
  },
}

export function getNovelAiContract(
  modelId?: string,
): NovelAiModelContract | undefined {
  return modelId ? NOVELAI_GENERATION_CONTRACT[modelId] : undefined
}

/**
 * 仅在当前模型声明了精确参考**且线格式已实证（`wireVerified: true`）**时返回契约。
 * 未实证的型号返回 `undefined`，使前端、卡片总线、服务端校验与 Worker 保持完全一致。
 */
export function getNovelAiPreciseReferenceContract(
  modelId?: string,
): NovelAiPreciseReferenceContract | undefined {
  const precise = getNovelAiContract(modelId)?.preciseReference
  return precise?.wireVerified ? precise : undefined
}

/**
 * 这个模型的角色构图长什么样；不支持角色构图的模型返回 `undefined`。
 *
 * ⚠ V4.5 是 2026-09-20（D10 ⑤）随标签台一起放进来的。worker 侧不需要改：
 * `v4_prompt.char_captions` 对全部结构化提示词模型（V4 / V4.5 / V5）都发，
 * 此前唯一的闸就是 `supportsNovelAiCharacters`。
 */
export function getNovelAiCharacterLayoutMode(
  modelId?: string,
): NovelAiCharacterLayoutMode | undefined {
  return getNovelAiContract(modelId)?.characterLayoutMode
}

/** 这个模型最多摆几个角色。不支持角色构图时是 0。 */
export function getNovelAiMaxCharacters(modelId?: string): number {
  return getNovelAiContract(modelId)?.maxCharacters ?? 0
}

export function supportsNovelAiCharacters(modelId?: string): boolean {
  return getNovelAiCharacterLayoutMode(modelId) !== undefined
}

/** 一位角色最多挂几条互动（角色页「再加一条」的上限）。 */
export const NOVELAI_MAX_INTERACTIONS_PER_CHARACTER = 4
/** 自己写的互动动作标签最长多少字。 */
export const NOVELAI_INTERACTION_TAG_MAX_CHARS = 60

/**
 * 互动的常用动作（设计画布「C · 选动作」）。`tag` 是 Danbooru 标签，发送时
 * 发起方写 `source#tag`、对方写 `target#tag`；`targetTag` 只在对方那边写法
 * 不同时给（官方多人页的例子就是 `source#pointing at another` /
 * `target#pointing`）；`mutual` = 天然两边都在做，「对谁」默认选「互相」，
 * 两边都写 `mutual#tag`。
 * https://docs.novelai.net/en/image/multiplecharacters/
 */
export const NOVELAI_INTERACTION_PRESETS = [
  { key: 'headpat', tag: 'headpat' },
  { key: 'hug', tag: 'hug' },
  { key: 'hugFromBehind', tag: 'hug from behind' },
  { key: 'holdingHands', tag: 'holding hands', mutual: true },
  { key: 'lookingAt', tag: 'looking at another' },
  { key: 'pointing', tag: 'pointing at another', targetTag: 'pointing' },
  { key: 'handOnShoulder', tag: "hand on another's shoulder" },
  { key: 'kiss', tag: 'kiss' },
  { key: 'princessCarry', tag: 'princess carry' },
  { key: 'feeding', tag: 'feeding' },
  { key: 'backToBack', tag: 'back-to-back', mutual: true },
  { key: 'faceToFace', tag: 'face-to-face', mutual: true },
] as const satisfies readonly {
  key: string
  tag: string
  targetTag?: string
  mutual?: boolean
}[]

export type NovelAiInteractionPreset =
  (typeof NOVELAI_INTERACTION_PRESETS)[number]

export function findNovelAiInteractionPreset(
  tag: string,
): NovelAiInteractionPreset | undefined {
  const key = tag.trim().toLowerCase()
  return NOVELAI_INTERACTION_PRESETS.find((preset) => preset.tag === key)
}

/**
 * 画面文字的种类（整体页那一行的下拉）。发送时各自翻成一句自然语言再并入
 * `Text:`：招牌 / 标题 / 封面 / 其他。
 */
export const NOVELAI_SCENE_TEXT_KINDS = [
  'sign',
  'title',
  'cover',
  'other',
] as const
export type NovelAiSceneTextKind = (typeof NOVELAI_SCENE_TEXT_KINDS)[number]
/** 整体页最多几条画面文字。 */
export const NOVELAI_MAX_SCENE_TEXTS = 4

/**
 * 画中文字（全部台词 + 画面文字合计）的上限与语言。V5 Full 750 / Curated 374
 * 认中日英；V4 / V4.5 只认英文、≤118（含空白与换行）。
 * ⚠ 这几个数只当护栏：官方文字页写 characters、模型页写 tokens，⛔ 不当成
 * provider 的精确契约。
 * https://docs.novelai.net/en/image/textrendering/
 */
export const NOVELAI_TEXT_LIMITS: Readonly<
  Record<string, { maxChars: number; latinOnly: boolean }>
> = Object.fromEntries(
  Object.entries(NOVELAI_GENERATION_CONTRACT).map(([modelId, contract]) => [
    modelId,
    contract.textLimit,
  ]),
)
/** 全名册里最大的那个上限 —— schema 不知道当前是哪个模型，只能卡这一档。 */
export const NOVELAI_TEXT_MAX_CHARS = 750

export function getNovelAiTextLimit(
  modelId?: string,
): { maxChars: number; latinOnly: boolean } | undefined {
  return getNovelAiContract(modelId)?.textLimit
}

/**
 * 网格档的格心坐标：5 格时是 0.1 / 0.3 / 0.5 / 0.7 / 0.9。
 * 自由档不经过它（V5 收的就是任意 0–1 的小数）。
 */
export function novelAiGridCellCenter(index: number): number {
  return (index + 0.5) / NOVELAI_CHARACTER_GRID_SIZE
}

/** 把任意 0–1 的坐标吸到最近的格心上（切到网格档时的落位）。 */
export function snapToNovelAiGrid(value: number): number {
  const clamped = Math.min(1, Math.max(0, value))
  const index = Math.min(
    NOVELAI_CHARACTER_GRID_SIZE - 1,
    Math.max(0, Math.round(clamped * NOVELAI_CHARACTER_GRID_SIZE - 0.5)),
  )
  return novelAiGridCellCenter(index)
}

/**
 * NovelAI 的出图尺寸档 —— 按比例查表（用于未指定自定义宽高时的默认回落）。
 * ⚠ 这张表由应用与 `workers/execution/src/providers/novelai/image.ts` 共读，
 * ⛔ 不要再在 worker 里留第二份。
 * https://docs.novelai.net/en/image/imagegeneration/
 */
export const NOVELAI_IMAGE_DIMENSIONS: Record<
  string,
  { width: number; height: number }
> = {
  '16:9': { width: 1216, height: 832 },
  '9:16': { width: 832, height: 1216 },
  '4:3': { width: 1024, height: 768 },
  '3:4': { width: 768, height: 1024 },
  '1:1': { width: 1024, height: 1024 },
}

export function getNovelAiImageDimensions(aspectRatio: string): {
  width: number
  height: number
} {
  return NOVELAI_IMAGE_DIMENSIONS[aspectRatio] ?? { width: 1024, height: 1024 }
}

/**
 * NovelAI 图像尺寸的 API 边界：宽 / 高均为 64 的倍数，单边 64–2048，
 * 总像素上限 3,145,728（2048×1536 / 1792×1792）。
 * https://docs.novelai.net/en/image/imagegeneration/
 */
export const NOVELAI_DIMENSION_STEP = 64
export const NOVELAI_DIMENSION_MIN = 64
export const NOVELAI_DIMENSION_MAX = 2048
export const NOVELAI_MAX_PIXELS = 3_145_728

export const NOVELAI_RESOLUTION_TIERS = [
  'small',
  'normal',
  'large',
  'wallpaper',
] as const
export type NovelAiResolutionTier = (typeof NOVELAI_RESOLUTION_TIERS)[number]

export const NOVELAI_RESOLUTION_ORIENTATIONS = [
  'portrait',
  'landscape',
  'square',
] as const
export type NovelAiResolutionOrientation =
  (typeof NOVELAI_RESOLUTION_ORIENTATIONS)[number]

export interface NovelAiResolutionPreset {
  readonly tier: NovelAiResolutionTier
  readonly orientation: NovelAiResolutionOrientation
  readonly width: number
  readonly height: number
}

/**
 * NovelAI 网页端四档预设尺寸（Small / Normal / Large / Wallpaper）。
 * Small 与 Normal 落在 Opus 免费面积（≤1024²）内；Large 与 Wallpaper 按 Anlas 计。
 * 既有 `4:3 (1024×768)` / `3:4 (768×1024)` 仍保留在 `NOVELAI_IMAGE_DIMENSIONS`
 * 作为默认比例回落，不强行塞进官网预设分组。
 */
export const NOVELAI_RESOLUTION_PRESETS: readonly NovelAiResolutionPreset[] = [
  { tier: 'small', orientation: 'portrait', width: 512, height: 768 },
  { tier: 'small', orientation: 'landscape', width: 768, height: 512 },
  { tier: 'small', orientation: 'square', width: 640, height: 640 },
  { tier: 'normal', orientation: 'portrait', width: 832, height: 1216 },
  { tier: 'normal', orientation: 'landscape', width: 1216, height: 832 },
  { tier: 'normal', orientation: 'square', width: 1024, height: 1024 },
  { tier: 'large', orientation: 'portrait', width: 1024, height: 1536 },
  { tier: 'large', orientation: 'landscape', width: 1536, height: 1024 },
  { tier: 'large', orientation: 'square', width: 1472, height: 1472 },
  { tier: 'wallpaper', orientation: 'portrait', width: 1088, height: 1920 },
  { tier: 'wallpaper', orientation: 'landscape', width: 1920, height: 1088 },
] as const

export function getNovelAiPresetsForTier(
  tier: NovelAiResolutionTier,
): readonly NovelAiResolutionPreset[] {
  return NOVELAI_RESOLUTION_PRESETS.filter((preset) => preset.tier === tier)
}

export function isValidNovelAiDimension(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= NOVELAI_DIMENSION_MIN &&
    value <= NOVELAI_DIMENSION_MAX &&
    value % NOVELAI_DIMENSION_STEP === 0
  )
}

export function isValidNovelAiDimensions(
  width: number,
  height: number,
): boolean {
  return (
    isValidNovelAiDimension(width) &&
    isValidNovelAiDimension(height) &&
    width * height <= NOVELAI_MAX_PIXELS
  )
}

/** 把任意数字吸附到合法的 64 倍数单边范围 [64, 2048]。 */
export function snapNovelAiDimension(value: number): number {
  if (!Number.isFinite(value)) return 1024
  const clamped = Math.min(
    NOVELAI_DIMENSION_MAX,
    Math.max(NOVELAI_DIMENSION_MIN, value),
  )
  const snapped =
    Math.round(clamped / NOVELAI_DIMENSION_STEP) * NOVELAI_DIMENSION_STEP
  return Math.min(
    NOVELAI_DIMENSION_MAX,
    Math.max(NOVELAI_DIMENSION_MIN, snapped),
  )
}

/**
 * 解析本次 NovelAI 生成最终发往 API 的宽高：成对合法的 `novelAiWidth / novelAiHeight`
 * 优先；未指定或非法时退回 `aspectRatio` 查表。前后端、Worker、UI 共用这一份。
 */
export function resolveNovelAiDimensions(input: {
  readonly aspectRatio?: string | null
  readonly novelAiWidth?: number | null
  readonly novelAiHeight?: number | null
}): { width: number; height: number } {
  if (
    typeof input.novelAiWidth === 'number' &&
    typeof input.novelAiHeight === 'number' &&
    isValidNovelAiDimensions(input.novelAiWidth, input.novelAiHeight)
  ) {
    return { width: input.novelAiWidth, height: input.novelAiHeight }
  }
  return getNovelAiImageDimensions(input.aspectRatio ?? '1:1')
}

export function findNovelAiResolutionPreset(
  width: number,
  height: number,
): NovelAiResolutionPreset | undefined {
  return NOVELAI_RESOLUTION_PRESETS.find(
    (preset) => preset.width === width && preset.height === height,
  )
}

export function inferNovelAiOrientation(
  width: number,
  height: number,
): NovelAiResolutionOrientation {
  if (width === height) return 'square'
  return width > height ? 'landscape' : 'portrait'
}

/**
 * 切换尺寸档位时自动保持当前横 / 竖 / 方方向。
 * Wallpaper 没有正方形，从正方形切过去时落到竖版（portrait）。
 */
export function pickNovelAiPresetForTier(
  tier: NovelAiResolutionTier,
  currentWidth: number,
  currentHeight: number,
): NovelAiResolutionPreset {
  const orientation = inferNovelAiOrientation(currentWidth, currentHeight)
  const tierPresets = getNovelAiPresetsForTier(tier)
  return (
    tierPresets.find((preset) => preset.orientation === orientation) ??
    tierPresets[0]!
  )
}

/** 把任意像素宽高落到最接近的 Studio 通用画幅比例（供跨模型切换、图库和配方导入用）。 */
export function closestNovelAiAspectRatio(
  width: number,
  height: number,
): '16:9' | '9:16' | '4:3' | '3:4' | '1:1' {
  const actual = Math.max(width, 1) / Math.max(height, 1)
  let best: '16:9' | '9:16' | '4:3' | '3:4' | '1:1' = '1:1'
  let bestGap = Infinity
  for (const [ratio, size] of Object.entries(NOVELAI_IMAGE_DIMENSIONS)) {
    const gap = Math.abs(size.width / size.height - actual)
    if (gap < bestGap) {
      best = ratio as '16:9' | '9:16' | '4:3' | '3:4' | '1:1'
      bestGap = gap
    }
  }
  return best
}

/**
 * Opus 订阅的免 Anlas 条件（官方 2026-11-17 核对）：**文生图 · 单张 · ≤1024² 像素
 * 面积 · ≤28 步**。官方原话是「without any other image used as a base」——
 * 图生图 / 遮罩重绘都带底图，不在里面；精确参考每张另加 5 Anlas（且随参考张数叠加）。
 * - https://docs.novelai.net/en/subscription/
 * - https://docs.novelai.net/en/image/precisereference/
 *
 * ⚠ V5 不是「不免」：官方 FAQ 写的是 Opus 用 V5 出免 Anlas 的图时**计入用量条**
 * （约每月 7000 张 / 23 步 · 普通尺寸），条用完才按 Anlas 扣。所以 V5 单列一档。
 * https://docs.novelai.net/en/faq/
 *
 * ⛔ 不放一个「大约多少 Anlas」的公式 —— NovelAI 没有公开逐档价目，凭社区逆向出来
 * 的系数摆在额度那一格上，比不报数更糟；超出免费范围时如实说「按 Anlas 计」。
 */
export const NOVELAI_OPUS_FREE_LIMITS = {
  maxPixels: 1024 * 1024,
  maxSteps: 28,
  maxImages: 1,
} as const

/**
 * `free` = Opus 不扣 Anlas；`usageLimited` = 不扣 Anlas 但计入 V5 用量条；
 * `metered` = 不在免费范围，按 Anlas 计。
 */
export type NovelAiOpusCost = 'free' | 'usageLimited' | 'metered'

/** Medium Effort（蒸馏档）的固定采样步数（官方锁死 14 步，不可改）。 */
export const NOVELAI_MEDIUM_FIXED_STEPS = 14

export function isNovelAiMediumModel(modelId: string | undefined): boolean {
  return getNovelAiContract(modelId)?.isMediumEffort === true
}

export function isNovelAiV5Model(modelId: string | undefined): boolean {
  return getNovelAiContract(modelId)?.generation === 'v5'
}

/**
 * 这一轮在 Opus 下扣不扣 Anlas。`modelIds` 是这一轮里的 NAI 型号（多选时
 * 只要有一个 V5 就报用量条）。
 */
export function getNovelAiOpusCost(input: {
  width: number
  height: number
  steps: number
  imageCount: number
  /** 挂了底图（图生图 / 遮罩重绘）。 */
  hasReferenceImage: boolean
  /** 挂了精确参考图（每张另加 5 Anlas，且整张图不再落在 Opus 免费窗口内）。 */
  preciseReferenceCount?: number
  modelIds: readonly string[]
}): NovelAiOpusCost {
  const effectiveSteps =
    input.modelIds.length > 0 && input.modelIds.every(isNovelAiMediumModel)
      ? NOVELAI_MEDIUM_FIXED_STEPS
      : input.steps
  const hasPreciseReferences = (input.preciseReferenceCount ?? 0) > 0
  const free =
    !input.hasReferenceImage &&
    !hasPreciseReferences &&
    input.width * input.height <= NOVELAI_OPUS_FREE_LIMITS.maxPixels &&
    effectiveSteps <= NOVELAI_OPUS_FREE_LIMITS.maxSteps &&
    input.imageCount <= NOVELAI_OPUS_FREE_LIMITS.maxImages
  if (!free) return 'metered'
  return input.modelIds.some(isNovelAiV5Model) ? 'usageLimited' : 'free'
}

/**
 * 官方网页端的预设缺省：质量标签**开**（Standard 档；Light 只有 V5 有），
 * UC 预设 **Heavy**。缺省就是这两档 —— 请求里没写 = 用它们，界面上也照这两档画，
 * ⛔ 不再有界面看不见的另一份缺省。
 * - https://docs.novelai.net/en/image/qualitytags/（「enabled by default」）
 * - https://docs.novelai.net/en/image/undesiredcontent/
 * - NAI Launcher `image_params.dart`：`qualityToggle` true · `qualityTier` standard · `ucPreset` 0 = Heavy
 */
export const NOVELAI_DEFAULT_QUALITY_PRESET = 'standard'
export const NOVELAI_DEFAULT_UC_PRESET = 'heavy'

/**
 * 图生图「重绘强度」= NovelAI 的 `strength` **原值**：越大改得越多（官方
 * strengthnoise 页「Higher Strength values allow the AI free rein to reinterpret
 * the image」）。缺省 0.7 与网页端一致（NAI Launcher `strength` @Default(0.7)）。
 * ⛔ 不做 1 − x 翻转 —— 那是别家「参考强度（越高越像原图）」的口径。
 * https://docs.novelai.net/en/image/strengthnoise
 */
export const NOVELAI_IMG2IMG_STRENGTH_RANGE = {
  min: 0.01,
  max: 0.99,
  step: 0.01,
  default: 0.7,
} as const

/**
 * NovelAI 采样器 —— 官方八档。⚠ worker 此前硬编 `k_euler_ancestral`，
 * D10 ⑤ 随标签台一起把它变成真控件；`k_euler_ancestral` 必须排第一，
 * 停在缺省上等于逐字保住现状。
 * https://docs.novelai.net/en/image/sampling/
 */
export const NOVELAI_SAMPLER_OPTIONS = [
  'k_euler_ancestral',
  'k_euler',
  'k_dpmpp_2s_ancestral',
  'k_dpmpp_2m',
  'k_dpmpp_2m_sde',
  'k_dpmpp_sde',
  'k_dpm_2',
  'ddim_v3',
] as const

export type NovelAiSampler = (typeof NOVELAI_SAMPLER_OPTIONS)[number]

export function supportsNovelAiPreciseReference(
  modelId: string | undefined,
): boolean {
  return getNovelAiPreciseReferenceContract(modelId) !== undefined
}

/**
 * 遮罩重绘用的 inpaint 模型名。⚠ NovelAI 的 inpaint 是**换一个模型 + 换一个
 * action**（`infill`），不是在原模型上加个参数。
 *
 * 每个模型都有自己的 `-inpainting` 版本，**只有 V5 Curated 例外**：网页端把它
 * 映射到 V4.5 Curated 的 inpaint 模型（NAI Launcher `resolveInpaintingModel`
 * 2026-10-23 核对；之前我们误配成 V4.5 Full）。所以 Curated 走的是一次**实打实的
 * 回落** —— 界面上要说出来，⛔ 不能让用户以为重绘也跑在 V5 Curated 上。
 */
export const NOVELAI_INPAINT_MODEL_IDS: Record<string, string> =
  Object.fromEntries(
    Object.entries(NOVELAI_GENERATION_CONTRACT).map(([modelId, contract]) => [
      modelId,
      contract.inpaintModelId,
    ]),
  )

/** 这个模型能不能遮罩重绘；返回真正要发给 provider 的模型名。 */
export function resolveNovelAiInpaintModelId(
  externalModelId?: string,
): string | undefined {
  return getNovelAiContract(externalModelId)?.inpaintModelId
}

/** 重绘时会掉到另一代模型上吗（今天只有 V5 Curated → V4.5 Curated）。 */
export function novelAiInpaintFallsBack(externalModelId?: string): boolean {
  return getNovelAiContract(externalModelId)?.inpaintFallsBack === true
}
