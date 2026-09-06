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
 * ── 预设头像为什么是**数据**而不是 SVG 字符串 ───────────────────────
 * §8.2 要的是「内联 SVG 常量，⛔ 不放静态图片文件」。真把 `<svg>…</svg>` 存成
 * 字符串，渲染那一跳就只能 `dangerouslySetInnerHTML` —— 为了六张 34px 的小图给
 * 自己开一个注入面，不值。所以这里存的是**画它要的几何**，由组件按 `kind` 画成
 * 真的 SVG 元素：一样不落文件、一样只用 `currentColor` 与 `--primary`，
 * 而且颜色只能取自下面那张封闭表（⛔ 脊柱外的颜色在类型上就写不出来）。
 */

/** 预设头像上允许出现的颜色——**只有这四个**，全部来自品牌脊柱。 */
export const ASSISTANT_AVATAR_INK_IDS = {
  /** `--primary` 实心。 */
  primary: 'primary',
  /** `--primary-foreground`，只用在 primary 底上的字/线。 */
  onPrimary: 'onPrimary',
  /** `currentColor` —— 跟着上下文的前景色走。 */
  current: 'current',
  /** `--muted` 实心底。 */
  muted: 'muted',
} as const

export type AssistantAvatarInk =
  (typeof ASSISTANT_AVATAR_INK_IDS)[keyof typeof ASSISTANT_AVATAR_INK_IDS]

/**
 * 一张预设头像里的一个图元。坐标系固定 24×24（组件按 `viewBox="0 0 24 24"` 画）。
 *
 * `initial` 是「把助手名字的首字母画在这里」——字母款预设的全部内容。
 * 名字为空时组件退回域名首字母，⛔ 不画一个空格。
 */
export type AssistantAvatarShape =
  | {
      kind: 'circle'
      cx: number
      cy: number
      r: number
      fill: AssistantAvatarInk
    }
  | {
      kind: 'ring'
      cx: number
      cy: number
      r: number
      stroke: AssistantAvatarInk
      strokeWidth: number
    }
  | {
      kind: 'rect'
      x: number
      y: number
      width: number
      height: number
      rx: number
      fill: AssistantAvatarInk
    }
  | { kind: 'path'; d: string; fill: AssistantAvatarInk }
  | {
      kind: 'stroke'
      d: string
      stroke: AssistantAvatarInk
      strokeWidth: number
    }
  | { kind: 'initial'; fill: AssistantAvatarInk }

export interface AssistantAvatarPreset {
  id: string
  shapes: readonly AssistantAvatarShape[]
}

/**
 * 六款预设（§8.2「图形 / 字母 / 色块各 2–3 款」）。
 *
 * ⚠ id 一旦发出去就**不能改**：它逐字存在 `AssistantPersona.avatarPreset` 列里。
 * 想换画法就改 `shapes`，⛔ 别改 id（改了等于把老用户的头像悄悄清空）。
 */
export const ASSISTANT_AVATAR_PRESET_IDS = [
  'spark',
  'orbit',
  'monogram',
  'stamp',
  'duotone',
  'tide',
] as const

export type AssistantAvatarPresetId =
  (typeof ASSISTANT_AVATAR_PRESET_IDS)[number]

export const ASSISTANT_AVATAR_PRESETS: Record<
  AssistantAvatarPresetId,
  AssistantAvatarPreset
> = {
  // 图形 ①：四角星。
  spark: {
    id: 'spark',
    shapes: [
      {
        kind: 'path',
        d: 'M12 2c.6 4.6 2.8 6.8 7.4 7.4v.2c-4.6.6-6.8 2.8-7.4 7.4h-.2c-.6-4.6-2.8-6.8-7.4-7.4v-.2C8.9 8.8 11.1 6.6 11.8 2Z',
        fill: ASSISTANT_AVATAR_INK_IDS.primary,
      },
      {
        kind: 'circle',
        cx: 17.5,
        cy: 18.5,
        r: 2.2,
        fill: ASSISTANT_AVATAR_INK_IDS.current,
      },
    ],
  },
  // 图形 ②：环与卫星。
  orbit: {
    id: 'orbit',
    shapes: [
      {
        kind: 'ring',
        cx: 12,
        cy: 12,
        r: 7,
        stroke: ASSISTANT_AVATAR_INK_IDS.current,
        strokeWidth: 1.5,
      },
      {
        kind: 'circle',
        cx: 12,
        cy: 12,
        r: 2.6,
        fill: ASSISTANT_AVATAR_INK_IDS.primary,
      },
      {
        kind: 'circle',
        cx: 19,
        cy: 7,
        r: 2,
        fill: ASSISTANT_AVATAR_INK_IDS.primary,
      },
    ],
  },
  // 字母 ①：实心底 + 首字母。
  monogram: {
    id: 'monogram',
    shapes: [
      {
        kind: 'rect',
        x: 1,
        y: 1,
        width: 22,
        height: 22,
        rx: 8,
        fill: ASSISTANT_AVATAR_INK_IDS.primary,
      },
      { kind: 'initial', fill: ASSISTANT_AVATAR_INK_IDS.onPrimary },
    ],
  },
  // 字母 ②：静音底 + 首字母 + 一道下划线。
  stamp: {
    id: 'stamp',
    shapes: [
      {
        kind: 'rect',
        x: 1,
        y: 1,
        width: 22,
        height: 22,
        rx: 4,
        fill: ASSISTANT_AVATAR_INK_IDS.muted,
      },
      { kind: 'initial', fill: ASSISTANT_AVATAR_INK_IDS.current },
      {
        kind: 'stroke',
        d: 'M7 19h10',
        stroke: ASSISTANT_AVATAR_INK_IDS.primary,
        strokeWidth: 1.5,
      },
    ],
  },
  // 色块 ①：对半分。
  duotone: {
    id: 'duotone',
    shapes: [
      {
        kind: 'rect',
        x: 1,
        y: 1,
        width: 22,
        height: 22,
        rx: 8,
        fill: ASSISTANT_AVATAR_INK_IDS.muted,
      },
      {
        kind: 'path',
        d: 'M12 1a11 11 0 0 1 0 22Z',
        fill: ASSISTANT_AVATAR_INK_IDS.primary,
      },
    ],
  },
  // 色块 ②：底 + 一道浪。
  tide: {
    id: 'tide',
    shapes: [
      {
        kind: 'rect',
        x: 1,
        y: 1,
        width: 22,
        height: 22,
        rx: 8,
        fill: ASSISTANT_AVATAR_INK_IDS.muted,
      },
      {
        kind: 'path',
        d: 'M1 13c3.7 0 3.7-3 7.3-3s3.7 3 7.4 3S19 10 23 10v13H1Z',
        fill: ASSISTANT_AVATAR_INK_IDS.primary,
      },
    ],
  },
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
  tone: ASSISTANT_PERSONA_TONE_IDS.professional,
  toneCustom: null,
  verbosity: ASSISTANT_PERSONA_VERBOSITY_IDS.standard,
  planMode: ASSISTANT_PERSONA_PLAN_MODE_IDS.auto,
  language: ASSISTANT_PERSONA_LANGUAGE_IDS.ui,
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
