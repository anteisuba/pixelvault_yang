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

/** 「到哪天为止」：一个日子（`2026-11-02`）。 */
export const AssistantMemoryUntilSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)))

/** 一条记忆读回来的样子。 */
export const AssistantMemorySchema = z.object({
  id: z.string().min(1),
  scope: AssistantMemoryScopeSchema,
  kind: AssistantMemoryKindSchema,
  source: AssistantMemorySourceSchema,
  text: AssistantMemoryTextSchema,
  /**
   * 属于哪个画布项目（owner 2026-10-09：一个项目一份记忆）。空 = 不归项目 ——
   * 全局 / 工作台范围（画布范围时就是「所有画布」）。
   */
  projectId: z.string().min(1).nullable().optional(),
  /** 那个项目现在叫什么（设置页那一列在范围那一格写它）。 */
  projectName: z.string().nullable().optional(),
  /**
   * 属于哪个角色（附录L：和她聊时学到的只留在和她的聊天里）。空 = 不归角色。
   * ⚠ 有它时范围一定是 `cards`。
   */
  characterCardId: z.string().min(1).nullable().optional(),
  /** 那个角色现在叫什么。 */
  characterName: z.string().nullable().optional(),
  /** 钉住：永不过期、永不被挤掉（第 ⑦ 步）。 */
  pinned: z.boolean().optional(),
  /** 到这个时刻就不再注入（ISO；AI 记带日子的事时定的）。空 = 一直成立。 */
  expiresAt: z.string().nullable().optional(),
  /** 沉睡了：被挤出去或过期了（她页上「沉睡」那一栏，能唤醒）。 */
  dormant: z.boolean().optional(),
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
 * ⚠ 也**不带域**（P3 作用域修正）：挂哪个域只由服务端按这一轮在哪台定。原来模型写了
 * `scope: "global"` 服务端照收，一条只属于这个工作台的事就漏进了所有工作台。
 */
export const AssistantMemoryCandidateSchema = z.object({
  kind: AssistantMemoryKindSchema,
  text: AssistantMemoryTextSchema,
  /** 带日子的事到哪天为止（`YYYY-MM-DD`，第 ⑦ 步）：模型给，过完再留几天就不再注入。缺席 = 一直成立。 */
  until: AssistantMemoryUntilSchema.optional(),
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
 * **你写一条**（助手设置 B · 记忆页那一格，回车存下）。
 *
 * ⚠ 缺 `scope` = 全部工作台（默认全局，owner 09-25）。来源与类别由服务端定：
 * 你写的一律是 `creator` + `rule`，⛔ 不收客户端递来的这两格。
 */
export const CreateAssistantMemorySchema = z
  .object({
    text: AssistantMemoryTextSchema,
    scope: AssistantMemoryScopeSchema.default(
      ASSISTANT_MEMORY_SCOPE_IDS.global,
    ),
  })
  .strict()

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
    /** 她页上「钉住 / 取消钉住」（第 ⑦ 步）。 */
    pinned: z.boolean().optional(),
    /** 她页上「唤醒」一条沉睡的：回到记得的里，过期的那个日子也一起去掉。 */
    wake: z.literal(true).optional(),
  })
  .strict()
  .refine(
    (input) =>
      input.text !== undefined ||
      input.scope !== undefined ||
      input.pinned !== undefined ||
      input.wake !== undefined,
    { message: 'Nothing to update' },
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

/** 她页「记忆」栏上「记一条」（第 ⑦ 步）：你写的，只归她。 */
export const CreateCharacterMemorySchema = z
  .object({ text: AssistantMemoryTextSchema })
  .strict()

export type CreateCharacterMemoryRequest = z.infer<
  typeof CreateCharacterMemorySchema
>
