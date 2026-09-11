/**
 * 助手设置（persona）与**项目规则**的 schema 层 ——
 * `docs/references/pages/assistant-shell.md` §8.4 与 §10。
 *
 * 词表住 `constants/assistant-persona.ts` / `constants/assistant-operator.ts`，
 * 分工与 `constants/assistant-operator.ts` ↔ `types/assistant-operator.ts` 同构。
 *
 * ⚠ 规则的 schema 为什么也在这个文件里：它们是**同一个入口的两半**（助手设置对话
 * 框 + 规则卡都是「这个助手按什么规矩替我干活」），而两边都只被 persona 那条路读写。
 * 拆成两个文件只会多一次 import，不会多一条边界。
 */

import { z } from 'zod'

import {
  ASSISTANT_AVATAR_PRESET_IDS,
  ASSISTANT_PERSONA_ARCHETYPES,
  ASSISTANT_PERSONA_LANGUAGES,
  ASSISTANT_PERSONA_LIMITS,
  ASSISTANT_PERSONA_PLAN_MODES,
  ASSISTANT_PERSONA_TONE_IDS,
  ASSISTANT_PERSONA_TONES,
  ASSISTANT_PERSONA_VERBOSITIES,
  ASSISTANT_ROUTE_MODEL_VALUES,
} from '@/constants/assistant-persona'
import {
  ASSISTANT_OPERATOR_DOMAINS,
  ASSISTANT_PROJECT_RULE_LIMITS,
  PROJECT_RULE_KIND_IDS,
  PROJECT_RULE_KINDS,
  PROJECT_RULE_SOURCE_KINDS,
  PROJECT_RULE_SOURCE_TOKEN_PATTERN,
  PROJECT_RULE_SOURCES,
} from '@/constants/assistant-operator'

// ─── persona ─────────────────────────────────────────────────────

export const AssistantAvatarPresetSchema = z.enum(ASSISTANT_AVATAR_PRESET_IDS)
export const AssistantPersonaToneSchema = z.enum(ASSISTANT_PERSONA_TONES)
export const AssistantPersonaVerbositySchema = z.enum(
  ASSISTANT_PERSONA_VERBOSITIES,
)
export const AssistantPersonaPlanModeSchema = z.enum(
  ASSISTANT_PERSONA_PLAN_MODES,
)
export const AssistantPersonaLanguageSchema = z.enum(
  ASSISTANT_PERSONA_LANGUAGES,
)
/**
 * 三档人设（§11.1）。⚠ **可空**：`null` 是「自定义」这一档真正的值 ——
 * 用户改过某个高级项，这一份不再完全对上任何一档。⛔ 不补一个 `custom`
 * 字面量：那样「没存过」「存了 custom」「对不上任何一档」会变成三个值，
 * 而它们是同一件事。
 */
export const AssistantPersonaArchetypeSchema = z.enum(
  ASSISTANT_PERSONA_ARCHETYPES,
)

export type AssistantPersonaArchetype = z.infer<
  typeof AssistantPersonaArchetypeSchema
>
/**
 * 文本模型 chip 选的那一档（§4.5）。词表 = 「自动」+ 路由表的九条 ——
 * ⚠ 名单从 `NODE_STUDIO_ASSISTANT_ROUTE_MODELS` 摊出来，⛔ 不在这里复制一份：
 * 复制的那一刻「界面能选」和「服务端认得」就开始各自漂。
 */
export const AssistantRouteModelSchema = z.enum(ASSISTANT_ROUTE_MODEL_VALUES)

export type AssistantRouteModel = z.infer<typeof AssistantRouteModelSchema>

/**
 * persona 的**列**本体。两个对外 schema 都从它派生 —— 写两遍字段的表现是
 * 「设置里能存的字段和读回来的字段悄悄不一样」。
 */
const AssistantPersonaShapeSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(ASSISTANT_PERSONA_LIMITS.maxNameChars)
    .nullable(),
  avatarPreset: AssistantAvatarPresetSchema.nullable(),
  avatarUrl: z.string().url().nullable(),
  tone: AssistantPersonaToneSchema,
  toneCustom: z
    .string()
    .trim()
    .min(1)
    .max(ASSISTANT_PERSONA_LIMITS.maxToneCustomChars)
    .nullable(),
  verbosity: AssistantPersonaVerbositySchema,
  planMode: AssistantPersonaPlanModeSchema,
  language: AssistantPersonaLanguageSchema,
  /** `auto` = 服务端自己挑（库里存 null）。⛔ 不做成可空：读回来永远是个词。 */
  routeModel: AssistantRouteModelSchema,
  /**
   * v2 §11.3 的三项 —— 它们只改**说话方式**，注入点在系统提示的
   * 「关于这位创作者」那一段（§8.3）。
   *
   * ⛔ 两个开关有意**不可空**：`null` 与 `false` 在开关上是同一件事，而多一个
   * 值就要多回答一次「没设过和关掉有什么不同」。缺行时走
   * `ASSISTANT_PERSONA_DEFAULTS`，与库上的 `@default` 逐字一致。
   */
  nextStepHint: z.boolean(),
  useMyWords: z.boolean(),
  /**
   * 选的是哪一张人设卡（§11.1）。`null` = 自定义。
   *
   * ⚠ 它**不是**第六个独立偏好：服务端只在它与上面那五格（tone / verbosity /
   * planMode / nextStepHint / useMyWords）逐格对得上时才落库，对不上就落 `null`
   * —— ⛔ 不信客户端递来的那个名字，否则卡上写的三行副文案随时可能是假话。
   */
  archetype: AssistantPersonaArchetypeSchema.nullable(),
  /** null = 用账号名。⚠ 它原样拼进系统提示，所以上限是硬的。 */
  addressUserAs: z
    .string()
    .trim()
    .min(1)
    .max(ASSISTANT_PERSONA_LIMITS.maxAddressUserAsChars)
    .nullable(),
})

/**
 * 选了「自定义语气」却没写那句话 = 一个空的风格段。⛔ 不静默退回
 * `professional`：用户明确选了 custom，悄悄换掉他的选择比报错坏。
 */
function toneCustomPresentWhenCustom(persona: {
  tone: string
  toneCustom: string | null
}): boolean {
  return (
    persona.tone !== ASSISTANT_PERSONA_TONE_IDS.custom ||
    Boolean(persona.toneCustom)
  )
}

const TONE_CUSTOM_REFINEMENT = {
  path: ['toneCustom'],
  message: 'toneCustom is required when tone=custom',
} satisfies { path: PropertyKey[]; message: string }

/**
 * 一份完整的 persona —— **读回来的形状**（缺行时是
 * `ASSISTANT_PERSONA_DEFAULTS` 填出来的那一份，不是 null）。
 *
 * ⚠ `avatarUrl` **不在写入 schema 里**（见 `UpdateAssistantPersonaSchema`）：
 * 它由头像上传/移除那条路自己写，客户端递一条 URL 进来等于绕开 R2 生命周期。
 */
export const AssistantPersonaSchema = AssistantPersonaShapeSchema.refine(
  toneCustomPresentWhenCustom,
  TONE_CUSTOM_REFINEMENT,
)

export type AssistantPersona = z.infer<typeof AssistantPersonaSchema>

/** PUT `/api/assistant/persona` 的载荷 —— persona 减去头像那两列。 */
export const UpdateAssistantPersonaSchema = AssistantPersonaShapeSchema.omit({
  avatarUrl: true,
}).refine(toneCustomPresentWhenCustom, TONE_CUSTOM_REFINEMENT)

export type UpdateAssistantPersonaRequest = z.infer<
  typeof UpdateAssistantPersonaSchema
>

/** POST `/api/assistant/persona/avatar` —— 与账户头像那条路同形（data URL / http）。 */
export const UploadAssistantAvatarSchema = z.object({
  imageData: z.string().min(1, 'Image data is required'),
})

export type UploadAssistantAvatarRequest = z.infer<
  typeof UploadAssistantAvatarSchema
>

// ─── 项目规则 ────────────────────────────────────────────────────

export const ProjectRuleSourceSchema = z.enum(PROJECT_RULE_SOURCES)
/** null = 全域。非空时是一个工作台域 id。 */
export const ProjectRuleScopeSchema = z.enum(ASSISTANT_OPERATOR_DOMAINS)

/**
 * 普通规则 / 只信这些来源 / 屏蔽这些来源（§9.3）。
 *
 * ⚠ 存量行读回来时**没有 kind** 的可能性不存在（库里带默认），但客户端老缓存
 * 里有 —— 所以读端给默认值 `note`，⛔ 不把一条老规则判成读不出来。
 */
export const ProjectRuleKindSchema = z.enum(PROJECT_RULE_KINDS)

export type ProjectRuleKind = z.infer<typeof ProjectRuleKindSchema>

/**
 * 来源名单一条里装的东西：**来源 id 或域名**（§9.3）。
 *
 * ⚠ 统一小写 + 砍掉协议头与末尾斜杠：用户会原样贴一条 `https://Danbooru.donmai.us/`
 * 进来，而名单是拿来逐字比对域名的。
 */
export const ProjectRuleSourceTokenSchema = z
  .string()
  .trim()
  .min(1)
  .max(ASSISTANT_PROJECT_RULE_LIMITS.maxTextChars)
  .transform((value) =>
    value
      .toLowerCase()
      .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
      .replace(/\/.*$/, '')
      .replace(/^www\./, ''),
  )
  .refine((value) => PROJECT_RULE_SOURCE_TOKEN_PATTERN.test(value), {
    message: 'Source rules take a source id or a domain, not a sentence',
  })

export const ProjectRuleSchema = z.object({
  id: z.string().min(1),
  scope: ProjectRuleScopeSchema.nullable(),
  text: z
    .string()
    .trim()
    .min(1)
    .max(ASSISTANT_PROJECT_RULE_LIMITS.maxTextChars),
  kind: ProjectRuleKindSchema.default(PROJECT_RULE_KIND_IDS.note),
  source: ProjectRuleSourceSchema,
  /** ISO 串。规则薄卡上那行「记于 YYYY-MM-DD」取它的日期段。 */
  createdAt: z.string(),
})

export type ProjectRule = z.infer<typeof ProjectRuleSchema>

/** 这一种规则装的是来源名单吗（§9.3）。 */
export function isProjectRuleSourceKind(
  kind: ProjectRuleKind | undefined,
): boolean {
  return PROJECT_RULE_SOURCE_KINDS.some((candidate) => candidate === kind)
}

/**
 * 把用户贴进来的一串收成**一个可比对的来源 token**。
 *
 * ⚠ 与 `ProjectRuleSourceTokenSchema` 的那几刀逐字同源：schema 是闸，这个函数
 * 是同一把刀给 UI 预览用的，⛔ 不许两边长得不一样。
 */
export function normalizeProjectRuleSourceToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./, '')
}

export const CreateProjectRuleSchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1)
      .max(ASSISTANT_PROJECT_RULE_LIMITS.maxTextChars),
    scope: ProjectRuleScopeSchema.nullish(),
    /** 缺省 = 普通规则（§9.3）。 */
    kind: ProjectRuleKindSchema.optional(),
    /**
     * 缺省 = `creator`（用户自己在设置里写的）。助手那条路由服务端写死
     * `assistant`，⛔ 不从模型收 —— 让它自己声明来源，来源就不再是证据。
     */
    source: ProjectRuleSourceSchema.optional(),
  })
  .transform((input) => {
    const kind = input.kind ?? PROJECT_RULE_KIND_IDS.note
    return {
      ...input,
      kind,
      text: isProjectRuleSourceKind(kind)
        ? normalizeProjectRuleSourceToken(input.text)
        : input.text,
    }
  })
  /**
   * ⚠ 来源名单那两种 kind 的 `text` **必须是来源 id 或域名**：收下一句
   * 「只信官方站」的下场是名单里永远有一条匹配不到任何东西，而助手会照常去打
   * 那些站 —— 用户以为自己设了闸，闸却不在。
   */
  .refine(
    (input) =>
      !isProjectRuleSourceKind(input.kind) ||
      PROJECT_RULE_SOURCE_TOKEN_PATTERN.test(input.text),
    { message: 'Source rules take a source id or a domain, not a sentence' },
  )

export type CreateProjectRuleRequest = z.infer<typeof CreateProjectRuleSchema>

/**
 * 客户端**递进来**的那一份（`kind` 可缺省）。⚠ 与上面那个类型分开：上面是过完
 * schema 之后的形态（`kind` 一定在），⛔ 别让 UI 为了满足类型给每一条都手填
 * 一个 `note`。
 */
export type CreateProjectRuleInput = z.input<typeof CreateProjectRuleSchema>

/** GET `/api/assistant/rules` 的查询串。`scope` 缺省 = 全都要（含全域那些）。 */
export const ListProjectRulesQuerySchema = z.object({
  scope: ProjectRuleScopeSchema.optional(),
})

export type ListProjectRulesQuery = z.infer<typeof ListProjectRulesQuerySchema>
