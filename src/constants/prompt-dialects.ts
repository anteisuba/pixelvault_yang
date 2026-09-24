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
 * 标签权重的**统一表示**：一个倍数，界面上一律显示成 `×1.2`。
 *
 * ⛔ 界面上不出现任何一家的原生语法 —— NAI 的 `{tag}` / `[tag]` 与 PixAI 的
 * `(tag:1.2)` 只在落 payload 的那一刻出现（`src/lib/prompt-tags.ts`）。
 */
export const PROMPT_TAG_WEIGHT = {
  DEFAULT: 1,
  MIN: 0.4,
  MAX: 2,
  STEP: 0.05,
} as const

/**
 * NovelAI 一层大括号 / 方括号的倍率：`{tag}` ×1.05、`[tag]` ÷1.05。统一权重
 * 翻成 NAI 语法时按这个底数取整数层数，所以落到 NAI 的是**最接近的那一档**，
 * ⛔ 不是逐字的 1.2。
 * https://docs.novelai.net/en/image/promptmixing/
 */
export const NOVELAI_BRACE_WEIGHT_STEP = 1.05
