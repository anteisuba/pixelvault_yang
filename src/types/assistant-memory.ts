/**
 * **助手记忆**的 schema 层（进度表 56a）。
 *
 * 词表与上限住 `constants/assistant-memory.ts`，分工与
 * `constants/context-cards.ts` ↔ `types/context-cards.ts` 同构。
 *
 * ── 读写分离 ───────────────────────────────────────────────────
 * ① **写入严格**（`.strict()`）：客户端递进来的每一格都会落库。
 * ② **读取有回落**：`AssistantMemorySchema` 是「库里那一行长什么样」—— 词表改过
 *    而存量没跟上时，读不出来的**那一条**被丢掉，⛔ 不连累整张列表打不开。
 * ③ 客户端能**写一条**（「你写的」，助手设置 B）、**改一行字与它用在哪**、删掉它、
 *    按「你写的 / 助手记的」清空；类别是服务端定的（你写的一律是规矩 `rule`）。
 */

import { z } from 'zod'

import {
  ASSISTANT_MEMORY_KINDS,
  ASSISTANT_MEMORY_LIMITS,
  ASSISTANT_MEMORY_SCOPE_IDS,
  ASSISTANT_MEMORY_SCOPES,
  ASSISTANT_MEMORY_SOURCES,
} from '@/constants/assistant-memory'
import { AssistantWorkspaceKeySchema } from '@/types/assistant-workspace'

export const AssistantMemoryScopeSchema = z.enum(ASSISTANT_MEMORY_SCOPES)
export const AssistantMemoryKindSchema = z.enum(ASSISTANT_MEMORY_KINDS)
/** 谁写的（助手设置 B · 记忆页「你写的 / 助手记的」）。 */
export const AssistantMemorySourceSchema = z.enum(ASSISTANT_MEMORY_SOURCES)

/** 一行字本身 —— 写入与读取共用这一条约束，⛔ 别在两处各写一遍长度。 */
export const AssistantMemoryTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(ASSISTANT_MEMORY_LIMITS.maxTextChars)

/** 一条记忆读回来的样子。 */
export const AssistantMemorySchema = z.object({
  id: z.string().min(1),
  scope: AssistantMemoryScopeSchema,
  workspaceKey: AssistantWorkspaceKeySchema.nullable(),
  kind: AssistantMemoryKindSchema,
  source: AssistantMemorySourceSchema,
  text: AssistantMemoryTextSchema,
  /** ISO 串。列表上那枚时间读 `updatedAt`（画板：今天 HH:mm · 昨天 · M/D）。 */
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type AssistantMemory = z.infer<typeof AssistantMemorySchema>

/**
 * 结账那一刻的**一条候选**（助手产出，服务端落库前还要过去重 / 敏感闸）。
 *
 * ⚠ 它**不带 id 也不带时间**：那两样由服务端给。⛔ 别让模型自己编 id ——
 * 编出来的每一个都指不到任何一行。
 */
export const AssistantMemoryCandidateSchema = z.object({
  kind: AssistantMemoryKindSchema,
  text: AssistantMemoryTextSchema,
})

export type AssistantMemoryCandidate = z.infer<
  typeof AssistantMemoryCandidateSchema
>

/** 总览列表那次查询。⚠ 缺 `scope` = 全部（chip 默认那一档）。 */
export const ListAssistantMemoriesQuerySchema = z
  .object({
    scope: AssistantMemoryScopeSchema.optional(),
    workspaceKey: AssistantWorkspaceKeySchema.optional(),
  })
  .strict()

export type ListAssistantMemoriesQuery = z.infer<
  typeof ListAssistantMemoriesQuerySchema
>

/**
 * **你写一条**（助手设置 B · 记忆页那一格，回车存下）。
 *
 * 全局需显式选择；工作台记忆以 workspaceKey 绑定。来源与类别由服务端定。
 */
export const CreateAssistantMemorySchema = z
  .object({
    text: AssistantMemoryTextSchema,
    scope: AssistantMemoryScopeSchema.optional(),
    workspaceKey: AssistantWorkspaceKeySchema.nullable().optional(),
  })
  .strict()
  .refine(
    (input) =>
      input.workspaceKey != null ||
      input.scope === ASSISTANT_MEMORY_SCOPE_IDS.global,
    { message: 'Choose a workspace or explicitly choose global memory' },
  )

export type CreateAssistantMemoryRequest = z.input<
  typeof CreateAssistantMemorySchema
>

/**
 * 就地改那一下：那一行字，和它用在哪（右边那颗范围下拉）。
 *
 * ⚠ 至少改一样；⛔ 不开放 kind / source —— 界面上没有改它们的地方，而一个没有
 * 界面的写入口只会被误用。
 */
export const UpdateAssistantMemorySchema = z
  .object({
    text: AssistantMemoryTextSchema.optional(),
    scope: AssistantMemoryScopeSchema.optional(),
    workspaceKey: AssistantWorkspaceKeySchema.nullable().optional(),
  })
  .strict()
  .refine(
    (input) =>
      input.text !== undefined ||
      input.scope !== undefined ||
      input.workspaceKey !== undefined,
    { message: 'Nothing to update' },
  )
  .refine(
    (input) =>
      (input.scope === undefined && input.workspaceKey === undefined) ||
      input.workspaceKey != null ||
      input.scope === ASSISTANT_MEMORY_SCOPE_IDS.global,
    { message: 'Choose a workspace or explicitly choose global memory' },
  )

export type UpdateAssistantMemoryRequest = z.infer<
  typeof UpdateAssistantMemorySchema
>

/**
 * 清空那一下（二次确认之后）—— **跟着筛选走**（助手设置 B）：「全部清空」/
 * 「清空你写的」/「清空助手记的」。缺 `source` = 全部。
 *
 * ⚠ 收一个**显式的 `confirm: true`** 而不是空体：这条路一次删掉一整类记忆，
 * 一个空 POST 就能触发的接口迟早会被别的东西误撞。
 */
export const ClearAssistantMemoriesSchema = z
  .object({
    confirm: z.literal(true),
    source: AssistantMemorySourceSchema.optional(),
  })
  .strict()

export type ClearAssistantMemoriesRequest = z.infer<
  typeof ClearAssistantMemoriesSchema
>
