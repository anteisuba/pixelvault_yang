/**
 * **她的成长**（10-26「更像真人」C 第 3 步）：设置「她」那一页读回来的样子 ——
 * 她的日记、她改了什么（每条能撤回）。
 *
 * ⚠ 写日记、记改动都在服务端（后台整理 / 对话里改卡）；客户端能撤回一条改动，
 * 日记能改、能删（角色大项目第 ③ 步）。
 */

import { z } from 'zod'

import {
  CHARACTER_REFLECTION,
  CHARACTER_REVISION_SOURCE_IDS,
} from '@/constants/cards'
import {
  CHARACTER_BROWSE_PAUSE_REASONS,
  CHARACTER_BROWSE_SOURCES,
} from '@/constants/character-browse'

export const CharacterJournalEntrySchema = z.object({
  id: z.string(),
  text: z.string(),
  createdAt: z.string(),
})

/** 改一篇她的日记（角色大项目第 ③ 步：日记你能改能删）。 */
export const UpdateCharacterJournalSchema = z.object({
  text: z.string().trim().min(1).max(CHARACTER_REFLECTION.journalChars),
})

export type UpdateCharacterJournalRequest = z.infer<
  typeof UpdateCharacterJournalSchema
>

export const CharacterRevisionEntrySchema = z.object({
  id: z.string(),
  source: z.enum([
    CHARACTER_REVISION_SOURCE_IDS.chat,
    CHARACTER_REVISION_SOURCE_IDS.reflection,
  ]),
  /** 改到的那几格（人设格名，或 name / tags / look）。 */
  fields: z.array(z.string()),
  before: z.record(z.string(), z.unknown()),
  after: z.record(z.string(), z.unknown()),
  /** 她自己说的为什么改（后台整理才有）。 */
  reason: z.string().nullable(),
  revertedAt: z.string().nullable(),
  createdAt: z.string(),
})

/** 她出门看到的一样（第 4 批）：她口吻的一句 + 来源与链接。 */
export const CharacterFindingEntrySchema = z.object({
  id: z.string(),
  source: z.enum(CHARACTER_BROWSE_SOURCES),
  url: z.string(),
  title: z.string(),
  note: z.string(),
  seenAt: z.string(),
})

/** 她的一条观点（她自己那份记忆里「观点：」开头的那几行）。`text` 去掉了前缀。 */
export const CharacterOpinionEntrySchema = z.object({
  id: z.string(),
  text: z.string(),
  createdAt: z.string(),
})

/** 出门逛的设置与状态（`CharacterCard.browse*`）。 */
export const CharacterBrowseStateSchema = z.object({
  enabled: z.boolean(),
  /** 助手路由表的 modelId；关上也留着，再打开接着用。从没打开过时是空。 */
  model: z.string().nullable(),
  pausedReason: z
    .enum([
      CHARACTER_BROWSE_PAUSE_REASONS.noModel,
      CHARACTER_BROWSE_PAUSE_REASONS.modelUnavailable,
      CHARACTER_BROWSE_PAUSE_REASONS.missingKey,
    ])
    .nullable(),
  browsedAt: z.string().nullable(),
})

export const CharacterGrowthSchema = z.object({
  journals: z.array(CharacterJournalEntrySchema),
  revisions: z.array(CharacterRevisionEntrySchema),
  findings: z.array(CharacterFindingEntrySchema),
  opinions: z.array(CharacterOpinionEntrySchema),
  browse: CharacterBrowseStateSchema,
})

/**
 * PUT `/api/character-cards/[id]/browse`：开关与型号。打开时不给型号 = 用助手当时那个
 * （`auto` 也行：服务端换成「自动」此刻挑中的那一个）；⛔ 开着却没型号。
 */
export const UpdateCharacterBrowseSchema = z.object({
  enabled: z.boolean(),
  model: z.string().trim().min(1).max(120).optional(),
})

/** POST `/api/character-cards/[id]/browse/now`：打开开关就出门一趟。`went: false` = 关着或刚出过门。 */
export const CharacterGoOutResultSchema = z.object({
  went: z.boolean(),
  kept: z.number().int().nonnegative(),
})

export const GoOutNowSchema = z.object({})

/** 角色总览「最近」一张卡：她最近一件事（第 ① 步）。`text` 是日记全文 / 出门看到的标题；改动给改到的格名。 */
export const CharacterRecentActivitySchema = z.object({
  cardId: z.string(),
  kind: z.enum(['journal', 'revision', 'finding']),
  text: z.string(),
  fields: z.array(z.string()),
  at: z.string(),
})

export const ListCharacterRecentActivityQuerySchema = z.object({})

export type CharacterRecentActivity = z.infer<
  typeof CharacterRecentActivitySchema
>
export type CharacterJournalEntry = z.infer<typeof CharacterJournalEntrySchema>
export type CharacterRevisionEntry = z.infer<
  typeof CharacterRevisionEntrySchema
>
export type CharacterFindingEntry = z.infer<typeof CharacterFindingEntrySchema>
export type CharacterOpinionEntry = z.infer<typeof CharacterOpinionEntrySchema>
export type CharacterBrowseState = z.infer<typeof CharacterBrowseStateSchema>
export type CharacterGrowth = z.infer<typeof CharacterGrowthSchema>
export type CharacterGoOutResult = z.infer<typeof CharacterGoOutResultSchema>
export type UpdateCharacterBrowseRequest = z.infer<
  typeof UpdateCharacterBrowseSchema
>
