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
 * ③ 客户端**只能改 `text`**：域与类别是助手写的观察结论，用户要的是改一句话或
 *    删掉它 —— 画板上那一行也只有这两个动作。
 */

import { z } from 'zod'

import {
  ASSISTANT_MEMORY_KINDS,
  ASSISTANT_MEMORY_LIMITS,
  ASSISTANT_MEMORY_SCOPES,
} from '@/constants/assistant-memory'

export const AssistantMemoryScopeSchema = z.enum(ASSISTANT_MEMORY_SCOPES)
export const AssistantMemoryKindSchema = z.enum(ASSISTANT_MEMORY_KINDS)

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
  kind: AssistantMemoryKindSchema,
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
  /**
   * 这一条挂哪个域。⚠ **缺席 = 当前域**（服务端补）：模型八成时候说的就是
   * 手边这台工作台的事，让它每条都写一遍 scope 只会多一个出错的地方。
   */
  scope: AssistantMemoryScopeSchema.optional(),
})

export type AssistantMemoryCandidate = z.infer<
  typeof AssistantMemoryCandidateSchema
>

/** 总览列表那次查询。⚠ 缺 `scope` = 全部（chip 默认那一档）。 */
export const ListAssistantMemoriesQuerySchema = z
  .object({
    scope: AssistantMemoryScopeSchema.optional(),
  })
  .strict()

export type ListAssistantMemoriesQuery = z.infer<
  typeof ListAssistantMemoriesQuerySchema
>

/**
 * 就地改那一下。
 *
 * ⚠ **只有 `text`**：画板上点的是那行字，改完回车就存。⛔ 不开放 scope / kind ——
 * 界面上没有改它们的地方，而一个没有界面的写入口只会被误用。
 */
export const UpdateAssistantMemorySchema = z
  .object({
    text: AssistantMemoryTextSchema,
  })
  .strict()

export type UpdateAssistantMemoryRequest = z.infer<
  typeof UpdateAssistantMemorySchema
>

/**
 * 「全部清空」那一下（二次确认之后）。
 *
 * ⚠ 收一个**显式的 `confirm: true`** 而不是空体：这条路一次删光用户全部记忆，
 * 一个空 POST 就能触发的接口迟早会被别的东西误撞。
 */
export const ClearAssistantMemoriesSchema = z
  .object({
    confirm: z.literal(true),
  })
  .strict()

export type ClearAssistantMemoriesRequest = z.infer<
  typeof ClearAssistantMemoriesSchema
>
