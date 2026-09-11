/**
 * 助手设置（persona）的**词表与默认值**——`docs/references/pages/assistant-shell.md` §8。
 *
 * 「这个助手是谁、怎么说话」，一个用户一份，四域共用，全局生效。
 * ⛔ 不做域级覆盖（Engineering Principles 2）。
 *
 * ── 这个文件为什么不放 Zod ─────────────────────────────────────────
 * 与 `constants/assistant-operator.ts` 逐字同源：全仓 `src/constants/` 零个文件
 * import zod，schema 一律住 `src/types/`（这里对应 `types/assistant-persona.ts`）。
 * 本文件会被客户端对话框直接 import，让它拖上 zod 是白付的包体积。
 *
 * ── 预设头像为什么这里只剩两个 id ─────────────────────────────────
 * 画法住组件（`AssistantAvatarGlyph`）：`mark` 直接复用品牌标
 * `components/ui/brand-mark.tsx`，`monogram` 是首字母圆标。⛔ 不落静态图片文件，
 * ⛔ 也不再在这里存一张「画它要的几何」的封闭表 —— 两款之后那张表是纯负担。
 */

import { NODE_STUDIO_ASSISTANT_ROUTE_MODELS } from '@/constants/node-studio'

/**
 * 预设头像**两款**（owner 2026-09-07 定：「先找一下，只给一两张预设图」）。
 *
 * ⚠ id 一旦发出去就**不能改**：它逐字存在 `AssistantPersona.avatarPreset` 列里。
 * 收窄之后库里还留着 `spark` / `stamp` / `duotone` / `tide` 这些悬空值 ——
 * ⛔ 不写迁移去改存量行，读的那一跳按 `normalizeAvatarPreset` 回落到默认款。
 */
export const ASSISTANT_AVATAR_PRESET_IDS = ['mark', 'monogram'] as const

export type AssistantAvatarPresetId =
  (typeof ASSISTANT_AVATAR_PRESET_IDS)[number]

/**
 * 库里那个字符串 → 词表里的 id。**词表外的一律回落到默认款**（⛔ 不抛错、
 * ⛔ 不出空圈）：老用户存的是已删掉的四款之一，他打开设置时该看到默认头像，
 * 而不是一个打不开的对话框。
 */
export function normalizeAvatarPreset(
  value: string | null | undefined,
): AssistantAvatarPresetId {
  return (ASSISTANT_AVATAR_PRESET_IDS as readonly string[]).includes(
    value ?? '',
  )
    ? (value as AssistantAvatarPresetId)
    : ASSISTANT_AVATAR_PRESET_IDS[0]
}

/**
 * 文本模型 chip 的「自动」档（§4.5）——**它是一个真选项**，排第一、也是默认值，
 * ⛔ 不是「没选时的显示文案」。选中它 = 服务端按 `resolveLlmTextRoute` 的优先级
 * 自己挑，与这一列为空时的行为逐字相同（库里存 null）。
 */
export const ASSISTANT_ROUTE_MODEL_AUTO = 'auto'

/**
 * 可选的文本模型 = 「自动」+ `NODE_STUDIO_ASSISTANT_ROUTE_MODELS` 的全部条目。
 *
 * ⚠ **名单不在这里复制**：路由表是唯一真值（改一条模型只改那一处），这里只把
 * 它的 `modelId` 摊平成词表。⛔ 别为了「看得见」在这里手写九个 id。
 */
export const ASSISTANT_ROUTE_MODEL_IDS = NODE_STUDIO_ASSISTANT_ROUTE_MODELS.map(
  (model) => model.modelId,
)

export type AssistantRouteModel =
  | typeof ASSISTANT_ROUTE_MODEL_AUTO
  | (typeof NODE_STUDIO_ASSISTANT_ROUTE_MODELS)[number]['modelId']

export const ASSISTANT_ROUTE_MODEL_VALUES = [
  ASSISTANT_ROUTE_MODEL_AUTO,
  ...ASSISTANT_ROUTE_MODEL_IDS,
] as [AssistantRouteModel, ...AssistantRouteModel[]]

/**
 * 词表里的值 → 路由表那一条（`auto` 与词表外的值都是 `null`）。
 *
 * ⚠ 服务端与 chip 共用这一跳：**「这个选择对应哪个厂商、哪个模型」只有一个答案**。
 * 库里存着一个已经下架的 modelId 时回落到 `null`（= 自动），⛔ 不抛错、
 * ⛔ 也不假装用户选的还在。
 */
export function getAssistantRouteModelEntry(
  value: string | null | undefined,
): (typeof NODE_STUDIO_ASSISTANT_ROUTE_MODELS)[number] | null {
  if (!value || value === ASSISTANT_ROUTE_MODEL_AUTO) return null
  return (
    NODE_STUDIO_ASSISTANT_ROUTE_MODELS.find(
      (model) => model.modelId === value,
    ) ?? null
  )
}

/** 库里那一列（`String?`）→ 词表值。null / 悬空值都是「自动」。 */
export function normalizeRouteModel(
  value: string | null | undefined,
): AssistantRouteModel {
  return (
    getAssistantRouteModelEntry(value)?.modelId ?? ASSISTANT_ROUTE_MODEL_AUTO
  )
}

/** 语气四档（§8.2）。`custom` 多带一句用户自己写的话。 */
export const ASSISTANT_PERSONA_TONE_IDS = {
  professional: 'professional',
  friendly: 'friendly',
  terse: 'terse',
  custom: 'custom',
} as const

export const ASSISTANT_PERSONA_TONES = [
  ASSISTANT_PERSONA_TONE_IDS.professional,
  ASSISTANT_PERSONA_TONE_IDS.friendly,
  ASSISTANT_PERSONA_TONE_IDS.terse,
  ASSISTANT_PERSONA_TONE_IDS.custom,
] as const

export type AssistantPersonaTone = (typeof ASSISTANT_PERSONA_TONES)[number]

/** 回复长度三档。落到系统提示里是**字数区间**，不是「简短点」这种无边界形容词。 */
export const ASSISTANT_PERSONA_VERBOSITY_IDS = {
  concise: 'concise',
  standard: 'standard',
  detailed: 'detailed',
} as const

export const ASSISTANT_PERSONA_VERBOSITIES = [
  ASSISTANT_PERSONA_VERBOSITY_IDS.concise,
  ASSISTANT_PERSONA_VERBOSITY_IDS.standard,
  ASSISTANT_PERSONA_VERBOSITY_IDS.detailed,
] as const

export type AssistantPersonaVerbosity =
  (typeof ASSISTANT_PERSONA_VERBOSITIES)[number]

/**
 * 默认行为三档 —— 「先问我」开关的**初始态**。
 *
 * ⚠ 单轮的「先问我」永远压过它（§8.5）：用户这一轮勾了，persona 是 `direct`
 * 也照样出计划卡。
 */
export const ASSISTANT_PERSONA_PLAN_MODE_IDS = {
  always: 'always',
  auto: 'auto',
  direct: 'direct',
} as const

export const ASSISTANT_PERSONA_PLAN_MODES = [
  ASSISTANT_PERSONA_PLAN_MODE_IDS.always,
  ASSISTANT_PERSONA_PLAN_MODE_IDS.auto,
  ASSISTANT_PERSONA_PLAN_MODE_IDS.direct,
] as const

export type AssistantPersonaPlanMode =
  (typeof ASSISTANT_PERSONA_PLAN_MODES)[number]

/**
 * 回复语言三档。`ui` = 跟界面语言走（即请求里带上来的 `responseLanguage`），
 * 另外两档**覆盖**它。
 *
 * ⛔ 不复用 `PromptAssistantResponseLanguage` 那张三值表：那张表没有「跟界面走」
 * 这一档，而这里的默认值正是它。
 */
export const ASSISTANT_PERSONA_LANGUAGE_IDS = {
  ui: 'ui',
  chinese: 'chinese',
  english: 'english',
} as const

export const ASSISTANT_PERSONA_LANGUAGES = [
  ASSISTANT_PERSONA_LANGUAGE_IDS.ui,
  ASSISTANT_PERSONA_LANGUAGE_IDS.chinese,
  ASSISTANT_PERSONA_LANGUAGE_IDS.english,
] as const

export type AssistantPersonaLanguage =
  (typeof ASSISTANT_PERSONA_LANGUAGES)[number]

/**
 * 缺行时用的默认值（§8.4 第 4 条：**不做首次访问自动建行**）。
 *
 * ⚠ 与 `prisma/schema.prisma` 上那几个 `@default(...)` 必须逐字一致 ——
 * 两处漂了，「没存过」和「存了默认值」就会表现成两个不同的助手。
 */
export const ASSISTANT_PERSONA_DEFAULTS = {
  name: null,
  avatarPreset: ASSISTANT_AVATAR_PRESET_IDS[0],
  avatarUrl: null,
  /**
   * ⭐ **默认是「简短直接 · 简洁」**（owner 2026-09-06 定）。
   *
   * 🔬 换掉的是 `professional` + `standard`。那一档跑出来的每一轮回复都是一段
   * 三四句的小作文，而助手多数轮次要说的其实只有两句：**做了什么 / 下一步是什么**。
   * 理由现在有地方放了（`turn.detail`，客户端折起来），所以正文不必再兼职解释。
   * ⚠ 这两个值必须与 `prisma/schema.prisma` 上 `AssistantPersona` 的 `@default`
   * 逐字一致 —— 漂了，「没存过」和「存了默认值」就是两个不同的助手。
   */
  tone: ASSISTANT_PERSONA_TONE_IDS.terse,
  toneCustom: null,
  verbosity: ASSISTANT_PERSONA_VERBOSITY_IDS.concise,
  planMode: ASSISTANT_PERSONA_PLAN_MODE_IDS.auto,
  language: ASSISTANT_PERSONA_LANGUAGE_IDS.ui,
  /** §4.5：默认「自动」= 库里 `routeModel` 为 null 时的语义，两处必须一致。 */
  routeModel: ASSISTANT_ROUTE_MODEL_AUTO,
} as const

export const ASSISTANT_PERSONA_LIMITS = {
  /** 助手名字（§8.2）。 */
  maxNameChars: 24,
  /**
   * 语气自定义那一句（§8.2 / §8.5）。
   * ⚠ 这条上限是**硬的**：它原样拼进系统提示，而风格段整段要压在 ~400 字符内。
   */
  maxToneCustomChars: 80,
  /** 风格段拼完之后的长度上限（§8.5）。超出即截断，⛔ 不静默放行。 */
  maxStyleSectionChars: 400,
} as const

/** 自定义头像在 R2 上的 key 前缀段（`generateProfileImageKey` 的 `type` 入参）。 */
export const ASSISTANT_AVATAR_STORAGE_TYPE = 'assistant-avatar'
