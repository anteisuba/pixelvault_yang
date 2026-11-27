import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { ROUTES } from '@/constants/routes'

/**
 * 提示词方言 —— D10 ② Q1 的分法：**分的是输入方言，不是厂商**。
 *
 * GPT · Gemini · Seedream · Flux 吃自然语言，参数面长得一样，留在
 * `/studio/image`；NovelAI · PixAI 吃 danbooru 标签，还带角色构图 / UC /
 * Vibe 这些别处没有的旋钮，另开 `/studio/image/tags`。
 *
 * ⛔ 不做「每个 provider 一条路由」：五页里三页会一样，以后每接一家多一页。
 * ⛔ 不做第三台。两台之间只有顶部那一对分段切换这一个门。
 */
export const PROMPT_DIALECTS = ['natural', 'tags'] as const

export type PromptDialect = (typeof PROMPT_DIALECTS)[number]

export const DEFAULT_PROMPT_DIALECT: PromptDialect = 'natural'

/** 每种方言那一台的路由 —— 方言由路由说了算（`StudioModeSync`）。 */
export const PROMPT_DIALECT_ROUTES: Record<PromptDialect, string> = {
  natural: ROUTES.STUDIO_IMAGE,
  tags: ROUTES.STUDIO_IMAGE_TAGS,
}

/**
 * 吃标签的 adapter。⚠ 名册以 `src/services/providers/registry.ts` 的
 * `PROVIDER_ADAPTERS` 为准 —— 这两条都在里面（`novelAiAdapter` / `pixAiAdapter`）。
 * 再接一家标签方言的 provider 时改这一处，两台的名单同时跟着变。
 */
const TAG_DIALECT_ADAPTERS: readonly AI_ADAPTER_TYPES[] = [
  AI_ADAPTER_TYPES.NOVELAI,
  AI_ADAPTER_TYPES.PIXAI,
]

/** 这个 adapter 说哪种方言。认不出来的一律按自然语言（新 adapter 默认留在 image）。 */
export function getPromptDialect(
  adapterType: AI_ADAPTER_TYPES | undefined,
): PromptDialect {
  return adapterType && TAG_DIALECT_ADAPTERS.includes(adapterType)
    ? 'tags'
    : 'natural'
}

/** 这个 adapter 属不属于标签台。 */
export function isTagDialectAdapter(
  adapterType: AI_ADAPTER_TYPES | undefined,
): boolean {
  return getPromptDialect(adapterType) === 'tags'
}

/**
 * 标签权重的统一表示：沿用 NovelAI V4.5 / V5 原生数值权重（`1.2::tag::`、负权重
 * `-2::tag::`），值域 `-5..5`，步进 `0.05`（Shift 粗调 `0.5`）。
 *
 * 落 payload 时：NovelAI 直接输出原生 `weight::tag::`（不再四舍五入成旧 `{}` / `[]`）；
 * PixAI / LoRA 括号模型正权输出 `(tag:1.2)`、非正权（≤ 0）剥离；自然语言模型只留文本。
 */
export const PROMPT_TAG_WEIGHT = {
  DEFAULT: 1,
  MIN: -5,
  MAX: 5,
  STEP: 0.05,
  COARSE_STEP: 0.5,
} as const

/**
 * NovelAI 旧版大括号 / 方括号的倍率：`{tag}` ×1.05、`[tag]` ÷1.05。
 * 仅用于解析用户粘贴进来的旧式 `{}` / `[]` 权重（翻成数值权重或跨模型转译），
 * 新输出一律走原生 `weight::tag::`。
 * https://docs.novelai.net/en/image/promptmixing/
 */
export const NOVELAI_BRACE_WEIGHT_STEP = 1.05

/**
 * 自然语言带到标签台时**让助手翻成标签**（owner 2026-09-27）的边界。
 *
 * ⚠ 模型回来的是一串逗号分隔的标签；多出来的截掉、长得像一句话的那一格丢掉，
 * ⛔ 不整串作废 —— 一格写歪不该让整句重回「整句一格」。
 */
export const PROMPT_TO_TAGS = {
  /** 一次最多留几格（一句话翻出来的标签很少过 40）。 */
  maxTags: 60,
  /** 一格最长多少字 —— 再长就是一句话，不是标签。 */
  maxTagChars: 80,
  /** 一格最多几个词（`looking at viewer` 这类是 3 个）。 */
  maxTagWords: 8,
} as const
