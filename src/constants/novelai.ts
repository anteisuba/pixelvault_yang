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
  if (
    modelId === AI_MODELS.NOVELAI_V5_FULL ||
    modelId === AI_MODELS.NOVELAI_V5_CURATED
  ) {
    return 'free'
  }
  if (
    modelId === AI_MODELS.NOVELAI_V45_FULL ||
    modelId === AI_MODELS.NOVELAI_V45_CURATED
  ) {
    return 'grid'
  }
  return undefined
}

/** 这个模型最多摆几个角色。不支持角色构图时是 0。 */
export function getNovelAiMaxCharacters(modelId?: string): number {
  const mode = getNovelAiCharacterLayoutMode(modelId)
  if (mode === 'free') return NOVELAI_V5_MAX_CHARACTERS
  if (mode === 'grid') return NOVELAI_V45_MAX_CHARACTERS
  return 0
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
> = {
  [AI_MODELS.NOVELAI_V5_FULL]: { maxChars: 750, latinOnly: false },
  [AI_MODELS.NOVELAI_V5_CURATED]: { maxChars: 374, latinOnly: false },
  [AI_MODELS.NOVELAI_V45_FULL]: { maxChars: 118, latinOnly: true },
  [AI_MODELS.NOVELAI_V45_CURATED]: { maxChars: 118, latinOnly: true },
}
/** 全名册里最大的那个上限 —— schema 不知道当前是哪个模型，只能卡这一档。 */
export const NOVELAI_TEXT_MAX_CHARS = 750

export function getNovelAiTextLimit(
  modelId?: string,
): { maxChars: number; latinOnly: boolean } | undefined {
  return modelId ? NOVELAI_TEXT_LIMITS[modelId] : undefined
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

export function isNovelAiV5Model(modelId: string | undefined): boolean {
  return (
    modelId === AI_MODELS.NOVELAI_V5_FULL ||
    modelId === AI_MODELS.NOVELAI_V5_CURATED
  )
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
  /** 挂了底图（图生图 / 遮罩重绘）或开了精确参考。 */
  hasReferenceImage: boolean
  modelIds: readonly string[]
}): NovelAiOpusCost {
  const free =
    !input.hasReferenceImage &&
    input.width * input.height <= NOVELAI_OPUS_FREE_LIMITS.maxPixels &&
    input.steps <= NOVELAI_OPUS_FREE_LIMITS.maxSteps &&
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

export const NOVELAI_REFERENCE_USAGES = ['standard', 'precise'] as const

export function supportsNovelAiPreciseReference(
  modelId: string | undefined,
): boolean {
  return (
    modelId === AI_MODELS.NOVELAI_V45_FULL ||
    modelId === AI_MODELS.NOVELAI_V45_CURATED
  )
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
export const NOVELAI_INPAINT_MODEL_IDS: Record<string, string> = {
  'nai-diffusion-5-full': 'nai-diffusion-5-full-inpainting',
  'nai-diffusion-5-curated': 'nai-diffusion-4-5-curated-inpainting',
  'nai-diffusion-4-5-full': 'nai-diffusion-4-5-full-inpainting',
  'nai-diffusion-4-5-curated': 'nai-diffusion-4-5-curated-inpainting',
}

/** 这个模型能不能遮罩重绘；返回真正要发给 provider 的模型名。 */
export function resolveNovelAiInpaintModelId(
  externalModelId?: string,
): string | undefined {
  if (!externalModelId) return undefined
  return NOVELAI_INPAINT_MODEL_IDS[externalModelId]
}

/** 重绘时会掉到另一代模型上吗（今天只有 V5 Curated → V4.5 Curated）。 */
export function novelAiInpaintFallsBack(externalModelId?: string): boolean {
  const target = resolveNovelAiInpaintModelId(externalModelId)
  if (!target || !externalModelId) return false
  return !target.startsWith(externalModelId)
}
