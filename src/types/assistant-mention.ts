import { z } from 'zod'

import {
  ASSISTANT_MENTION_GROUPS,
  ASSISTANT_MENTION_KINDS,
  ASSISTANT_MENTION_LIMITS,
  ASSISTANT_MENTION_ROLES,
  ASSISTANT_MENTION_SCOPES,
} from '@/constants/assistant-mention'

/**
 * 统一引用模型（设计方案 §10b）—— 客户端、请求、历史三处同一份形状。
 *
 * ⚠ `id` 是**身份**，`label` 只是快照：正文存 `<@kind:id>`，名字跟着引用一起存，
 * 改名之后旧消息里显示的仍是当时的名字。
 * ⚠ `url` 只给「看图 / 内联缩略」用，⛔ 不作为身份（同一张图可以既在画布上又在库里）。
 */
const MentionIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[^\s>]+$/)

export const AssistantMentionKindSchema = z.enum(ASSISTANT_MENTION_KINDS)
export const AssistantMentionScopeSchema = z.enum(ASSISTANT_MENTION_SCOPES)
export const AssistantMentionRoleSchema = z.enum(ASSISTANT_MENTION_ROLES)

export const AssistantMentionSchema = z.object({
  kind: AssistantMentionKindSchema,
  id: MentionIdSchema,
  label: z.string().trim().min(1).max(ASSISTANT_MENTION_LIMITS.maxLabelChars),
  thumb: z.string().trim().min(1).max(4000).optional(),
  scope: AssistantMentionScopeSchema,
  /** 画布上的卡：定位、高亮、句柄都靠它。 */
  nodeId: z.string().trim().min(1).max(200).optional(),
  /** 库里那一件（结果 / 素材库 / 上传）：看图与 `@图_012` 命中靠它。 */
  generationId: z.string().trim().min(1).max(200).optional(),
  /** 看图用的地址（图 / 视频 / 音频）。 */
  url: z.string().trim().min(1).max(4000).optional(),
  /** 产物真序号（`Generation.seq`）——`#12` 搜索与 `@图_012` 指认用。 */
  seq: z.number().int().nonnegative().optional(),
  /** 当哪种参考用（胶囊小卡片上定的）；缺省 = 只是指给助手看。 */
  role: AssistantMentionRoleSchema.optional(),
})

export type AssistantMention = z.infer<typeof AssistantMentionSchema>
export type AssistantMentionKind = z.infer<typeof AssistantMentionKindSchema>
export type AssistantMentionScope = z.infer<typeof AssistantMentionScopeSchema>
export type AssistantMentionRole = z.infer<typeof AssistantMentionRoleSchema>
export type AssistantMentionGroupId = (typeof ASSISTANT_MENTION_GROUPS)[number]

/**
 * 发给服务端的那一份 —— 不带缩略图与地址（看图的地址走 `mentionedAssets`，
 * 那张名单同时是 `look` / `critique_result` 的准入闸）。
 */
export const AssistantMentionRefSchema = AssistantMentionSchema.pick({
  kind: true,
  id: true,
  label: true,
  scope: true,
  nodeId: true,
  generationId: true,
  seq: true,
  role: true,
})
export type AssistantMentionRef = z.infer<typeof AssistantMentionRefSchema>

/**
 * `@` 菜单里的一行候选 = 一条引用 + 给人认的副标题（所在画布 / 文件夹 / 类型）。
 * ⚠ `missing` 不在这里：候选永远是此刻还在的东西。
 */
export interface AssistantMentionCandidate extends AssistantMention {
  /** 第二行小字：S02 · 图 / 文件夹名 / 类型。 */
  readonly subtitle?: string
  /** 悬停时的内容预览（文本节点的前几句）。 */
  readonly preview?: string
  /** 额外参与搜索的字（提示词、标签、文件夹、模型名），⛔ 不显示。 */
  readonly keywords?: readonly string[]
}

// ─── 素材库检索（服务端多字段）──────────────────────────────────────

export const AssistantMentionLibrarySearchSchema = z.object({
  q: z
    .string()
    .trim()
    .max(ASSISTANT_MENTION_LIMITS.maxQueryChars)
    .optional()
    .default(''),
  /** 只在这个文件夹（连同子孙夹）里找；缺省 = 整个库。 */
  folderId: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(ASSISTANT_MENTION_LIMITS.libraryPageSize)
    .optional()
    .default(ASSISTANT_MENTION_LIMITS.libraryPageSize),
})
export type AssistantMentionLibrarySearch = z.input<
  typeof AssistantMentionLibrarySearchSchema
>

export const AssistantMentionLibraryItemSchema = z.object({
  id: z.string(),
  kind: AssistantMentionKindSchema,
  label: z.string(),
  url: z.string(),
  thumb: z.string().optional(),
  seq: z.number().int().optional(),
  /** 它在哪些夹里（第一个当副标题）。 */
  folders: z.array(z.string()),
  /** 提示词开头一段（悬停预览 + 客户端排序用）。 */
  prompt: z.string(),
  model: z.string(),
  createdAt: z.string(),
})
export type AssistantMentionLibraryItem = z.infer<
  typeof AssistantMentionLibraryItemSchema
>

export const AssistantMentionLibraryFolderSchema = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
})
export type AssistantMentionLibraryFolder = z.infer<
  typeof AssistantMentionLibraryFolderSchema
>

export const AssistantMentionLibraryResultSchema = z.object({
  items: z.array(AssistantMentionLibraryItemSchema),
  /** 名字命中查询的文件夹（空查询时 = 当前层的子夹），点进去下钻。 */
  folders: z.array(AssistantMentionLibraryFolderSchema),
})
export type AssistantMentionLibraryResult = z.infer<
  typeof AssistantMentionLibraryResultSchema
>

/** 按地址查名字（参考位带真名）。 */
export const AssistantMentionLookupSchema = z.object({
  urls: z.array(z.string().trim().url().max(4000)).min(1).max(16),
})
export type AssistantMentionLookup = z.infer<
  typeof AssistantMentionLookupSchema
>
