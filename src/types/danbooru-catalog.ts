import { z } from 'zod'

export const DanbooruCatalogKindSchema = z.enum(['character', 'artist'])
export type DanbooruCatalogKind = z.infer<typeof DanbooruCatalogKindSchema>

/**
 * 查资料（标签台，owner 2026-09-27 B）的三种问法：
 * 搜名字（`query`）· 取一个候选的详情（`tag`）· 画风页「随便看看」（`random`）。
 */
export const DanbooruCatalogQuerySchema = z
  .object({
    query: z.string().trim().min(2).max(100).optional(),
    kind: DanbooruCatalogKindSchema,
    tag: z
      .string()
      .max(150)
      .regex(/^[a-z0-9_().'\-]+$/i)
      .optional(),
    random: z.literal('1').optional(),
  })
  .refine(
    (value) =>
      Boolean(value.tag || value.query) ||
      (value.random === '1' && value.kind === 'artist'),
    { message: 'query, tag or random artists required' },
  )
export type DanbooruCatalogQuery = z.infer<typeof DanbooruCatalogQuerySchema>

export const DanbooruCatalogSchema = z.object({
  candidates: z.array(
    z.object({
      name: z.string(),
      count: z.number(),
      category: z.number(),
      /** 角色出自哪部作品（样图上的第一个作品标签）；画师没有。 */
      work: z.string().nullable().default(null),
      /** 全年龄缩略样图：角色一张，画师三张。 */
      previews: z.array(z.string().url()).default([]),
    }),
  ),
  /** 这一页查不到、另一页有 —— 给「它是画师 / 角色」那句跨页提示。 */
  crossHint: z
    .object({
      kind: DanbooruCatalogKindSchema,
      name: z.string(),
      count: z.number(),
    })
    .nullable()
    .default(null),
  detail: z
    .object({
      tag: z.string(),
      count: z.number().nullable().default(null),
      work: z.string().nullable().default(null),
      aliases: z.array(z.string()),
      sampleSize: z.number(),
      traits: z.array(z.object({ tag: z.string(), count: z.number() })),
      images: z.array(
        z.object({
          id: z.number(),
          url: z.string().url(),
          /** 大图（详情里那三张要比缩略大一档）。 */
          large: z.string().url().nullable().default(null),
        }),
      ),
    })
    .nullable(),
})
export type DanbooruCatalog = z.infer<typeof DanbooruCatalogSchema>
export type DanbooruCatalogCandidate = DanbooruCatalog['candidates'][number]
