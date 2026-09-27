import { z } from 'zod'

import { PROMPT_ENHANCE } from '@/constants/config'
import { PROMPT_TAG_WEIGHT } from '../constants/prompt-dialects'

/**
 * 标签台编辑器里的一格。
 *
 * ⚠ 与 `types/prompt-tags.ts` 的 `PromptTagSelection` 是两件事，⛔ 别混：
 * 那一套是**词库里的一条定义被选中**（带 id / 来源 / 分类，供 LoRA 工作台的
 * 托盘与内联补全用）；这一格是**用户正在编辑的那串字**——可以是词库里的一个
 * danbooru 标签，也可以是从自然语言台整句带过来的一句话。两者在标签台里相遇：
 * 补全从词库来，落进编辑器就只剩 `text` + `weight`。
 *
 * `weight` 是统一倍数，界面一律显示成 `×1.2`，落 payload 时按 provider 翻译。
 */
export const TagChipSchema = z
  .object({
    text: z.string().trim().min(1),
    weight: z
      .number()
      .min(PROMPT_TAG_WEIGHT.MIN)
      .max(PROMPT_TAG_WEIGHT.MAX)
      .default(PROMPT_TAG_WEIGHT.DEFAULT),
  })
  .strict()

export type TagChip = z.infer<typeof TagChipSchema>

export const TagChipListSchema = z.array(TagChipSchema)

export const TagPromptBlockSchema = z.object({
  id: z.string(),
  name: z.string().max(100),
  text: z.string(),
  enabled: z.boolean(),
})
export type TagPromptBlock = z.infer<typeof TagPromptBlockSchema>

/**
 * 标签模板（owner 2026-09-26）：与自然语言模板同一个库（`Recipe`），靠 `params`
 * 里这一格区分，两台各只列自己的。`compiledPrompt` 存整体正向标签（⛔ 不含
 * 画风与画师串那几块），UC 与各角色随 `params.advancedParams` 走。
 */
export const TagTemplateParamsSchema = z.object({
  promptDialect: z.literal('tags'),
})

/**
 * 自然语言带到标签台时**让助手翻成标签**（owner 2026-09-27）。
 * `modelId` = 这一轮选中的 NAI 型号：有它才顺手过一遍官方联想核对。
 */
export const PromptToTagsRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(PROMPT_ENHANCE.MAX_INPUT_LENGTH),
  modelId: z.string().optional(),
})
export type PromptToTagsRequest = z.infer<typeof PromptToTagsRequestSchema>

/** 翻好的一串（逗号分隔，与 `prompt` 同一种写法，客户端按 `parseTagChips` 切格）。 */
export interface PromptToTagsResponseData {
  tags: string
}
