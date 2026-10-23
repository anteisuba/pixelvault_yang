import { z } from 'zod'

import { ASSISTANT_SKILL_LIMITS as LIMITS } from '@/constants/assistant-skills'

/**
 * 「你的技能」（第 7b 步）的线上形状。服务端解析成一整套（内置 + 你改过的 + 你自己写的），
 * 设置页照这个摆；导出成 SKILL.md 也从这里拿。
 */

export const AssistantSkillOriginSchema = z.enum([
  'builtin',
  'override',
  'mine',
])

/** 不能有「/」（`技能·名字/references/…` 靠它分开）和换行。 */
export const AssistantSkillNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(LIMITS.maxNameChars)
  .regex(/^[^/\n\r·・]+$/, 'name cannot contain / or ·')

export const AssistantSkillDescriptionSchema = z
  .string()
  .trim()
  .min(1)
  .max(LIMITS.maxDescriptionChars)

export const AssistantSkillBodySchema = z
  .string()
  .trim()
  .min(1)
  .max(LIMITS.maxBodyChars)

export const AssistantSkillViewSchema = z.object({
  /** 表里那一行的 id；没改过的内置没有。 */
  id: z.string().nullable(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  body: z.string(),
  references: z.record(z.string(), z.string()),
  origin: AssistantSkillOriginSchema,
  enabled: z.boolean(),
  /** 助手自己会读（内置）；false = 只能「/」叫（你写的）。 */
  autoRead: z.boolean(),
})
export type AssistantSkillView = z.infer<typeof AssistantSkillViewSchema>

export const CreateAssistantSkillSchema = z.object({
  name: AssistantSkillNameSchema,
  description: AssistantSkillDescriptionSchema,
  body: AssistantSkillBodySchema,
})
export type CreateAssistantSkillRequest = z.infer<
  typeof CreateAssistantSkillSchema
>

/** 改你自己写的那份（或你那份内置改版）：给了哪格改哪格。 */
export const UpdateAssistantSkillSchema = z
  .object({
    name: AssistantSkillNameSchema.optional(),
    description: AssistantSkillDescriptionSchema.optional(),
    body: AssistantSkillBodySchema.optional(),
    enabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'nothing to update')
export type UpdateAssistantSkillRequest = z.infer<
  typeof UpdateAssistantSkillSchema
>

/** 内置那几份：开 / 关，或「改成我的版本」（给 body 就是改版）。 */
export const UpdateBuiltinSkillSchema = z
  .object({
    slug: z.string().min(1).max(64),
    enabled: z.boolean().optional(),
    body: AssistantSkillBodySchema.optional(),
    description: AssistantSkillDescriptionSchema.optional(),
  })
  .refine(
    (value) => value.enabled !== undefined || value.body !== undefined,
    'nothing to update',
  )
export type UpdateBuiltinSkillRequest = z.infer<typeof UpdateBuiltinSkillSchema>
