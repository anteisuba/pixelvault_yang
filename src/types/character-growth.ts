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
  CHARACTER_BROWSE_SOURCES,
  CHARACTER_OUTING,
  CHARACTER_OUTING_END_REASONS,
  CHARACTER_OUTING_STATUS,
  CHARACTER_OUTING_VIDEO,
  CHARACTER_VIDEO_SOURCES,
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

/** 指定视频（第 ⑥ 步，`parseOutingVideoLink` 认出来的那一条）。 */
export const OutingVideoLinkSchema = z.object({
  platform: z.enum(CHARACTER_VIDEO_SOURCES),
  url: z.string().url().max(300),
  start: z.number().int().min(0).optional(),
  end: z.number().int().min(1).optional(),
})

/**
 * 一趟出门（角色大项目第 ⑤ 步）。`nowLabel` = 「来源\n搜索词」（来源是内置站 id 或 `site:域名`）；
 * `usedTokens` 按 `CHARACTER_OUTING.tokensPerPoint` 折点给人看。
 */
export const CharacterOutingRunSchema = z.object({
  id: z.string(),
  status: z.enum([
    CHARACTER_OUTING_STATUS.running,
    CHARACTER_OUTING_STATUS.done,
    CHARACTER_OUTING_STATUS.stopped,
    CHARACTER_OUTING_STATUS.failed,
  ]),
  model: z.string(),
  sources: z.array(z.string()),
  sites: z.array(z.string()),
  /** 开着「看视频」的来源（第 ⑥ 步）。 */
  videos: z.array(z.string()),
  pinnedVideos: z.array(OutingVideoLinkSchema),
  budgetPoints: z.number().int(),
  usedTokens: z.number().int(),
  kept: z.number().int(),
  nowLabel: z.string().nullable(),
  endReason: z
    .enum([
      CHARACTER_OUTING_END_REASONS.budget,
      CHARACTER_OUTING_END_REASONS.stopped,
      CHARACTER_OUTING_END_REASONS.nothing,
      CHARACTER_OUTING_END_REASONS.failed,
    ])
    .nullable(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
})

/** 出门卡要的：正在跑的那一趟、最近几趟（河里每趟一条；弹框记住上次的选法）、你常加的网址。 */
export const CharacterOutingStateSchema = z.object({
  running: CharacterOutingRunSchema.nullable(),
  recent: z.array(CharacterOutingRunSchema),
  frequentSites: z.array(z.string()),
})

/**
 * POST `/api/character-cards/[id]/outing`：弹框里的选法。`sources` 空 = 自动（这个模型去得了的都去）；
 * `model` 可以是 `auto`（服务端换成「自动」此刻挑中的那一个）。
 */
export const StartCharacterOutingSchema = z.object({
  model: z.string().trim().min(1).max(120),
  sources: z
    .array(z.enum(CHARACTER_BROWSE_SOURCES))
    .max(CHARACTER_BROWSE_SOURCES.length),
  sites: z
    .array(z.string().trim().min(1).max(CHARACTER_OUTING.siteChars))
    .max(CHARACTER_OUTING.maxSites),
  /** 开着「看视频」的来源；关着的只看评论区。 */
  videos: z
    .array(z.enum(CHARACTER_VIDEO_SOURCES))
    .max(CHARACTER_VIDEO_SOURCES.length)
    .default([]),
  /** 你贴的视频链接（服务端再认一遍，认不出的丢掉）。 */
  pinnedVideos: z
    .array(OutingVideoLinkSchema)
    .max(CHARACTER_OUTING_VIDEO.maxPinned)
    .default([]),
  budgetPoints: z
    .number()
    .int()
    .min(CHARACTER_OUTING.minBudget)
    .max(CHARACTER_OUTING.maxBudget),
})

/** POST `/api/character-cards/[id]/outing/stop`：「结束」。 */
export const StopCharacterOutingSchema = z.object({})

export const CharacterGrowthSchema = z.object({
  journals: z.array(CharacterJournalEntrySchema),
  revisions: z.array(CharacterRevisionEntrySchema),
  findings: z.array(CharacterFindingEntrySchema),
  opinions: z.array(CharacterOpinionEntrySchema),
  outing: CharacterOutingStateSchema,
})

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
export type CharacterOutingRun = z.infer<typeof CharacterOutingRunSchema>
export type CharacterOutingState = z.infer<typeof CharacterOutingStateSchema>
export type StartCharacterOutingRequest = z.infer<
  typeof StartCharacterOutingSchema
>
export type CharacterGrowth = z.infer<typeof CharacterGrowthSchema>
