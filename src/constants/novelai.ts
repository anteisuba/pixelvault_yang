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
 * NovelAI 的出图尺寸档 —— 按比例查表。⚠ 这张表原本只活在
 * `workers/execution/src/index.ts` 里，标签台右列要报「分辩率」这个真数，
 * 于是抬到这里由两边共读，⛔ 不要再在 worker 里留第二份。
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
 * Opus 订阅的免费生成窗口：**单张 · ≤1024² · ≤28 步**。超出就开始烧 Anlas。
 *
 * ⚠ 这里只放官方写过的那条判据，⛔ 不放一个「大约多少 Anlas」的公式 ——
 * NovelAI 没有公开逐档价目，凭社区逆向出来的系数摆在额度那一格上，比不报数更糟。
 * 画板那格写的「约 28 Anlas」是示意数，真值待官方口径。
 * https://docs.novelai.net/en/subscription/
 */
export const NOVELAI_OPUS_FREE_LIMITS = {
  maxPixels: 1024 * 1024,
  maxSteps: 28,
  maxImages: 1,
} as const

export function isWithinNovelAiOpusFreeTier(input: {
  width: number
  height: number
  steps: number
  imageCount: number
}): boolean {
  return (
    input.width * input.height <= NOVELAI_OPUS_FREE_LIMITS.maxPixels &&
    input.steps <= NOVELAI_OPUS_FREE_LIMITS.maxSteps &&
    input.imageCount <= NOVELAI_OPUS_FREE_LIMITS.maxImages
  )
}

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
 * V5 只有 Full 有自己的 inpaint 模型，Curated 借 V4.5 Full 的那一个
 * （`docs/design/roadmap-canvas/research/novelai-pixai.md` A 节，官方 models 页
 * 与 inpaint 页 2026-09-20 核对）。所以 Curated 走的是一次**实打实的回落** ——
 * 界面上要说出来，⛔ 不能让用户以为重绘也跑在 V5 Curated 上。
 */
export const NOVELAI_INPAINT_MODEL_IDS: Record<string, string> = {
  'nai-diffusion-5-full': 'nai-diffusion-5-full-inpainting',
  'nai-diffusion-5-curated': 'nai-diffusion-4-5-full-inpainting',
}

/** 这个模型能不能遮罩重绘；返回真正要发给 provider 的模型名。 */
export function resolveNovelAiInpaintModelId(
  externalModelId?: string,
): string | undefined {
  if (!externalModelId) return undefined
  return NOVELAI_INPAINT_MODEL_IDS[externalModelId]
}

/** 重绘时会掉到另一代模型上吗（今天只有 V5 Curated → V4.5 Full）。 */
export function novelAiInpaintFallsBack(externalModelId?: string): boolean {
  const target = resolveNovelAiInpaintModelId(externalModelId)
  if (!target || !externalModelId) return false
  return !target.startsWith(externalModelId)
}
