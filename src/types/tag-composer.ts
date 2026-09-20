import { z } from 'zod'

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
