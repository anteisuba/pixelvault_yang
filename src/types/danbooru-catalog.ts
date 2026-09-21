import { z } from 'zod'

export const DanbooruCatalogQuerySchema = z.object({
  query: z.string().trim().min(2).max(100),
  kind: z.enum(['character', 'artist']),
  tag: z
    .string()
    .max(150)
    .regex(/^[a-z0-9_().'\-]+$/i)
    .optional(),
})
export type DanbooruCatalogQuery = z.infer<typeof DanbooruCatalogQuerySchema>
export const DanbooruCatalogSchema = z.object({
  candidates: z.array(
    z.object({ name: z.string(), count: z.number(), category: z.number() }),
  ),
  detail: z
    .object({
      tag: z.string(),
      aliases: z.array(z.string()),
      sampleSize: z.number(),
      traits: z.array(z.object({ tag: z.string(), count: z.number() })),
      images: z.array(z.object({ id: z.number(), url: z.string().url() })),
    })
    .nullable(),
})
export type DanbooruCatalog = z.infer<typeof DanbooruCatalogSchema>
