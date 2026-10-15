import { z } from 'zod'

import {
  ASSISTANT_OPERATOR_LIMITS,
  ASSISTANT_RESEARCH_LIMITS,
  ASSISTANT_WEB_FIND_LIMITS,
} from '@/constants/assistant-operator'
import { RESEARCH_LIMITS as RESEARCH_SOURCE_LIMITS } from '@/constants/research'
import { WEB_VIDEO_PLATFORMS } from '@/constants/web-video'

/**
 * **找到的东西**（`#n`，搜索期第三片，附录 I §3.3）—— 本轮记录与下一轮请求里搬的那一份。
 *
 * ⭐ 它只为两件事存在：服务端把模型写的 `#3` 换回那张图的地址（导入 / 挂参考 / 交给角色卡），
 *   以及给模型那一行 `#3 · 标题 · 域名 · 宽×高 · 可当参考`。⛔ 模型看不到这里的地址。
 * ⚠ **没有「能不能当参考」那一格**：这份要经前端往返（接力、下一轮），服务端每一跳按域名
 *   重新判（`judgeWebImageSource`），⛔ 不信带回来的结论。
 */

const FindNumberSchema = z
  .number()
  .int()
  .min(1)
  .max(ASSISTANT_WEB_FIND_LIMITS.maxNumber)

const FindUrlSchema = z.string().url().max(4_000)
const FindLabelSchema = z
  .string()
  .trim()
  .min(1)
  .max(ASSISTANT_OPERATOR_LIMITS.maxLabelChars)

export const AssistantWebImageFindSchema = z.object({
  kind: z.literal('image'),
  n: FindNumberSchema,
  /** 原图直链：导入时取的就是它。 */
  imageUrl: FindUrlSchema,
  thumbnailUrl: FindUrlSchema.optional(),
  pageUrl: FindUrlSchema.optional(),
  domain: FindLabelSchema.optional(),
  publisher: FindLabelSchema.optional(),
  title: z
    .string()
    .max(ASSISTANT_OPERATOR_LIMITS.maxPriorStepSummaryChars)
    .optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
})
export type AssistantWebImageFind = z.infer<typeof AssistantWebImageFindSchema>

export const AssistantWebVideoFindSchema = z.object({
  kind: z.literal('video'),
  n: FindNumberSchema,
  /** 播放页（⛔ 不是视频流）：没有一条工具吃它，只为说清「#n 是一支视频」。 */
  url: FindUrlSchema,
  title: z
    .string()
    .trim()
    .min(1)
    .max(ASSISTANT_OPERATOR_LIMITS.maxPriorStepSummaryChars),
  platform: z.enum(WEB_VIDEO_PLATFORMS),
  channel: FindLabelSchema.optional(),
  domain: FindLabelSchema.optional(),
  durationSeconds: z
    .number()
    .int()
    .positive()
    .max(RESEARCH_SOURCE_LIMITS.maxVideoDurationSeconds)
    .optional(),
})
export type AssistantWebVideoFind = z.infer<typeof AssistantWebVideoFindSchema>

export const AssistantWebFindSchema = z.discriminatedUnion('kind', [
  AssistantWebImageFindSchema,
  AssistantWebVideoFindSchema,
])
export type AssistantWebFind = z.infer<typeof AssistantWebFindSchema>

/**
 * 查证（`search_web`）这一次给的资料号 `[n]` → 那一页（搜索期第三片）：往后几步模型只剩
 * 一行摘要，`read "[n]"` 由服务端按这张表换回地址再读一遍。⚠ 没有地址的证据（标签统计、
 * 搜索模型自己的回答片段）不在表里。
 */
export const AssistantResearchSourceRefSchema = z.object({
  cite: z.number().int().min(1).max(ASSISTANT_WEB_FIND_LIMITS.maxNumber),
  url: FindUrlSchema,
  title: z.string().max(ASSISTANT_RESEARCH_LIMITS.maxEvidenceTitleChars),
  /**
   * 那一页的**搜索摘要**（读全文之前的那一段，2026-10-15）：再读那一页被站点挡了时，只交它并明说
   * 全文没读到。⛔ 不进模型看的东西（模型读 `compact` 那一行）。
   */
  snippet: z
    .string()
    .max(ASSISTANT_RESEARCH_LIMITS.maxEvidenceSnippetChars)
    .optional(),
})
export type AssistantResearchSourceRef = z.infer<
  typeof AssistantResearchSourceRefSchema
>
