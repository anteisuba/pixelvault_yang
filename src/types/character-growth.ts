/**
 * **她的成长**（10-26「更像真人」C 第 3 步）：设置「她」那一页读回来的样子 ——
 * 她的日记、她改了什么（每条能撤回）。
 *
 * ⚠ 只读回来的形状：写日记、记改动都在服务端（后台整理 / 对话里改卡），
 * 客户端能做的只有「撤回一条」。
 */

import { z } from 'zod'

import { CHARACTER_REVISION_SOURCE_IDS } from '@/constants/cards'

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

export const CharacterGrowthSchema = z.object({
  journals: z.array(CharacterJournalEntrySchema),
  revisions: z.array(CharacterRevisionEntrySchema),
})

export type CharacterJournalEntry = z.infer<typeof CharacterJournalEntrySchema>
export type CharacterRevisionEntry = z.infer<
  typeof CharacterRevisionEntrySchema
>
export type CharacterGrowth = z.infer<typeof CharacterGrowthSchema>
