import { z } from 'zod'
import { AI_MODELS } from '@/constants/models/enum'

export const NovelAiTagModelSchema = z.enum([
  AI_MODELS.NOVELAI_V45_FULL,
  AI_MODELS.NOVELAI_V45_CURATED,
  AI_MODELS.NOVELAI_V5_FULL,
  AI_MODELS.NOVELAI_V5_CURATED,
])
export type NovelAiTagModel = z.infer<typeof NovelAiTagModelSchema>

export const NovelAiTagQuerySchema = z.object({
  model: NovelAiTagModelSchema,
  prompt: z.string().trim().min(2).max(200),
  lang: z.enum(['en', 'jp']).default('en'),
})
export type NovelAiTagQuery = z.infer<typeof NovelAiTagQuerySchema>

export const NovelAiTagResponseSchema = z.object({
  tags: z.array(
    z.object({
      tag: z.string().min(1),
      count: z.number().optional(),
      confidence: z.number().optional(),
    }),
  ),
})
export type NovelAiTagResponse = z.infer<typeof NovelAiTagResponseSchema>
