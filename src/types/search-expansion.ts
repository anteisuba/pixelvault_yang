import { z } from 'zod'

import { SEARCH_EXPANSION } from '@/constants/semantic-search'

export const SearchExpansionQuerySchema = z.object({
  q: z.string().trim().min(1).max(SEARCH_EXPANSION.MAX_QUERY_CHARS),
})

export const SearchExpansionSchema = z.object({
  words: z.array(z.string()),
})

export type SearchExpansion = z.infer<typeof SearchExpansionSchema>
