import { z } from 'zod'
import { AI_MODELS } from '@/constants/models/enum'

export const NovelAiTagModelSchema = z.enum([
  AI_MODELS.NOVELAI_V45_FULL,
  AI_MODELS.NOVELAI_V45_CURATED,
  AI_MODELS.NOVELAI_V5_FULL,
  AI_MODELS.NOVELAI_V5_FULL_MEDIUM,
  AI_MODELS.NOVELAI_V5_CURATED,
])
export type NovelAiTagModel = z.infer<typeof NovelAiTagModelSchema>

export const NovelAiTagQuerySchema = z.object({
  model: NovelAiTagModelSchema,
  prompt: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine(
      (value) => /[^\x00-\x7f]/.test(value) || value.length >= 2,
      'ASCII tag query must be at least 2 characters',
    ),
  lang: z.enum(['en', 'jp']).default('en'),
})
export type NovelAiTagQuery = z.infer<typeof NovelAiTagQuerySchema>

export const NovelAiTagSuggestionSourceSchema = z.enum([
  'official',
  'dictionary',
  'semantic',
])
export type NovelAiTagSuggestionSource = z.infer<
  typeof NovelAiTagSuggestionSourceSchema
>

export const NovelAiTagSuggestionSchema = z.object({
  tag: z.string().min(1),
  count: z.number().optional(),
  confidence: z.number().optional(),
  zh: z.string().nullable().optional(),
  zhNote: z.string().nullable().optional(),
  ja: z.string().nullable().optional(),
  category: z.number().int().optional(),
  source: NovelAiTagSuggestionSourceSchema.optional(),
})
export type NovelAiTagSuggestion = z.infer<typeof NovelAiTagSuggestionSchema>

export const NovelAiTagResponseSchema = z.object({
  tags: z.array(NovelAiTagSuggestionSchema),
})
export type NovelAiTagResponse = z.infer<typeof NovelAiTagResponseSchema>
