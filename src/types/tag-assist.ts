import { z } from 'zod'
import { NovelAiTagSuggestionSchema } from '@/types/novelai-tags'

export const DanbooruTagSuggestQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine(
      (value) => /[^\x00-\x7f]/.test(value) || value.length >= 2,
      'ASCII tag query must be at least 2 characters',
    ),
})
export type DanbooruTagSuggestQuery = z.infer<
  typeof DanbooruTagSuggestQuerySchema
>

export const DanbooruTagSuggestResponseSchema = z.object({
  tags: z.array(NovelAiTagSuggestionSchema),
})
export type DanbooruTagSuggestResponse = z.infer<
  typeof DanbooruTagSuggestResponseSchema
>

export const DanbooruTagMetaRequestSchema = z.object({
  tags: z.array(z.string().trim().min(1).max(160)).min(1).max(100),
})
export type DanbooruTagMetaRequest = z.infer<
  typeof DanbooruTagMetaRequestSchema
>

export const DanbooruTagMetaEntrySchema = z.object({
  tag: z.string(),
  zh: z.string().nullable(),
  zhNote: z.string().nullable(),
  ja: z.string().nullable(),
  count: z.number().int().nonnegative(),
  category: z.number().int().nullable(),
  known: z.boolean(),
})
export type DanbooruTagMetaEntry = z.infer<typeof DanbooruTagMetaEntrySchema>

export const DanbooruTagMetaResponseSchema = z.object({
  items: z.record(z.string(), DanbooruTagMetaEntrySchema),
})
export type DanbooruTagMetaResponse = z.infer<
  typeof DanbooruTagMetaResponseSchema
>

export const DanbooruCooccurrenceQuerySchema = z.object({
  tags: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .transform((value) =>
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    )
    .refine((list) => list.length >= 1, 'At least one tag is required'),
})

export const DanbooruCooccurrenceItemSchema = z.object({
  tag: z.string(),
  count: z.number().int().nonnegative(),
  ratio: z.number().min(0).max(1),
  zh: z.string().nullable().optional(),
  zhNote: z.string().nullable().optional(),
  ja: z.string().nullable().optional(),
})
export type DanbooruCooccurrenceItem = z.infer<
  typeof DanbooruCooccurrenceItemSchema
>

export const DanbooruCooccurrenceResponseSchema = z.object({
  queriedTags: z.array(z.string()),
  truncated: z.boolean(),
  sampleSize: z.number().int().nonnegative(),
  items: z.array(DanbooruCooccurrenceItemSchema),
})
export type DanbooruCooccurrenceResponse = z.infer<
  typeof DanbooruCooccurrenceResponseSchema
>
