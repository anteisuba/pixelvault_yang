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
  ASSISTANT_PERSONA_LANGUAGES,
  ASSISTANT_PERSONA_LIMITS,
  ASSISTANT_PERSONA_PLAN_MODES,
  ASSISTANT_PERSONA_TONE_IDS,
  ASSISTANT_PERSONA_TONES,
  ASSISTANT_PERSONA_VERBOSITIES,
} from '@/constants/assistant-persona'
import {
  ASSISTANT_OPERATOR_DOMAINS,
  ASSISTANT_PROJECT_RULE_LIMITS,
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

export const ProjectRuleSchema = z.object({
  id: z.string().min(1),
  scope: ProjectRuleScopeSchema.nullable(),
  text: z
    .string()
    .trim()
    .min(1)
    .max(ASSISTANT_PROJECT_RULE_LIMITS.maxTextChars),
  source: ProjectRuleSourceSchema,
  /** ISO 串。规则薄卡上那行「记于 YYYY-MM-DD」取它的日期段。 */
  createdAt: z.string(),
})

export type ProjectRule = z.infer<typeof ProjectRuleSchema>

export const CreateProjectRuleSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1)
    .max(ASSISTANT_PROJECT_RULE_LIMITS.maxTextChars),
  scope: ProjectRuleScopeSchema.nullish(),
  /**
   * 缺省 = `creator`（用户自己在设置里写的）。助手那条路由服务端写死
   * `assistant`，⛔ 不从模型收 —— 让它自己声明来源，来源就不再是证据。
   */
  source: ProjectRuleSourceSchema.optional(),
})

export type CreateProjectRuleRequest = z.infer<typeof CreateProjectRuleSchema>

/** GET `/api/assistant/rules` 的查询串。`scope` 缺省 = 全都要（含全域那些）。 */
export const ListProjectRulesQuerySchema = z.object({
  scope: ProjectRuleScopeSchema.optional(),
})

export type ListProjectRulesQuery = z.infer<typeof ListProjectRulesQuerySchema>
