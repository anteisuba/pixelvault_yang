/**
 * **她的成长**（10-26「更像真人」C 第 3 步）：设置「她」那一页读回来的样子 ——
 * 她的日记、她改了什么（每条能撤回）。
 *
 * ⚠ 只读回来的形状：写日记、记改动都在服务端（后台整理 / 对话里改卡），
 * 客户端能做的只有「撤回一条」。
 */

import { z } from 'zod'

import { CHARACTER_REVISION_SOURCE_IDS } from '@/constants/cards'
import {
  CHARACTER_BROWSE_PAUSE_REASONS,
  CHARACTER_BROWSE_SOURCES,
} from '@/constants/character-browse'

export const CharacterJournalEntrySchema = z.object({
  id: z.string(),
  text: z.string(),
  createdAt: z.string(),
})

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
  /** 助手路由表的 modelId；开关关着时是空。 */
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

export type CharacterJournalEntry = z.infer<typeof CharacterJournalEntrySchema>
export type CharacterRevisionEntry = z.infer<
  typeof CharacterRevisionEntrySchema
>
export type CharacterFindingEntry = z.infer<typeof CharacterFindingEntrySchema>
export type CharacterOpinionEntry = z.infer<typeof CharacterOpinionEntrySchema>
export type CharacterBrowseState = z.infer<typeof CharacterBrowseStateSchema>
export type CharacterGrowth = z.infer<typeof CharacterGrowthSchema>
export type UpdateCharacterBrowseRequest = z.infer<
  typeof UpdateCharacterBrowseSchema
>
