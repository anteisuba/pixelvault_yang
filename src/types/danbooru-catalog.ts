import { z } from 'zod'

/**
 * 查资料四页：角色 · 画风（画师 + 画法，owner 2026-10-22）· 作品 · 特征（通用标签）。
 * 画法不另成一类：它是画风页里的一段，按名字认（`isStyleMediumTag`）。
 */
export const DanbooruCatalogKindSchema = z.enum([
  'character',
  'artist',
  'copyright',
  'general',
])
export type DanbooruCatalogKind = z.infer<typeof DanbooruCatalogKindSchema>

/**
 * 一个 Danbooru tag 名。⚠ 名字里常有 `! : /`（princess_connect!、re:zero、
 * fate/grand_order），⛔ 只放行字母数字；要挡的是拼进额外搜索条件：空白、逗号、
 * 打头的 `-` / `~`（Danbooru 的排除 / 或运算）。
 */
const DanbooruTagNameSchema = z
  .string()
  .max(150)
  .regex(/^[^\s,\-~][^\s,]*$/)

/** 只放行 Danbooru 自家 CDN 的 https 地址 —— 这些 URL 会直接进 `<img>`。 */
const DonmaiImageUrlSchema = z
  .string()
  .url()
  .refine((raw) => {
    const url = new URL(raw)
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'donmai.us' || url.hostname.endsWith('.donmai.us'))
    )
  })

/**
 * 查资料（标签台，owner 2026-09-27 B）与标签库（第 9f 步 9f-2c）的几种问法：
 * 搜名字（`query`）· 取一个候选的详情（`tag`）· 「随便看看」（`random`）·
 * 按热度翻页（`page`，标签库的网格）· 一张卡的样图（`tag` + `preview`，网格的卡滚到才问）。
 *
 * `kind` 只有取详情时可以不写（台上 Ctrl+点一格标签：不知道它是哪一类，按 tag 自己的类别认）。
 */
export const DanbooruCatalogQuerySchema = z
  .object({
    query: z.string().trim().min(2).max(100).optional(),
    kind: DanbooruCatalogKindSchema.optional(),
    tag: DanbooruTagNameSchema.optional(),
    random: z.literal('1').optional(),
    page: z.coerce.number().int().min(1).max(200).optional(),
    preview: z.literal('1').optional(),
  })
  .refine(
    (value) =>
      Boolean(value.tag || value.query || value.page) || value.random === '1',
    { message: 'query, tag, page or random required' },
  )
  .refine((value) => Boolean(value.kind) || (value.tag && !value.preview), {
    message: 'kind required',
  })
export type DanbooruCatalogQuery = z.infer<typeof DanbooruCatalogQuerySchema>

/** 中日文名（词库 `DanbooruTagName`，9f-2c）：界面按语言挑一个显示；词库里没有就是 `null`。 */
const LocalNamesShape = {
  zh: z.string().nullish(),
  ja: z.string().nullish(),
}

export const DanbooruCatalogSchema = z.object({
  candidates: z.array(
    z.object({
      name: z.string(),
      count: z.number(),
      category: z.number(),
      /** 角色出自哪部作品（样图上的第一个作品标签）；别的页没有。 */
      work: z.string().nullable().default(null),
      /** 全年龄缩略样图：角色一张，别的页三张。 */
      previews: z.array(z.string().url()).default([]),
      ...LocalNamesShape,
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
  /** 按热度翻页（`page`）时下一页的页码；翻到底 / 别的问法是 `null`。 */
  nextPage: z.number().nullable().default(null),
  detail: z
    .object({
      tag: z.string(),
      /** 这个 tag 归哪一页（问的时候没写 `kind` 就靠它）。 */
      kind: DanbooruCatalogKindSchema,
      count: z.number().nullable().default(null),
      work: z.string().nullable().default(null),
      aliases: z.array(z.string()),
      /** Danbooru Wiki 的头一段，去掉了排版记号；没有 Wiki 是 `null`。 */
      wiki: z.string().nullable().default(null),
      ...LocalNamesShape,
      /** 中文词库那份的一句注释（说这个标签是什么）。 */
      zhNote: z.string().nullish(),
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

/** 收藏一条（查资料里的角色 / 画师 / 作品 / 特征）：存收藏那一刻左栏那一行的样子。 */
export const CreateDanbooruFavoriteSchema = z.object({
  kind: DanbooruCatalogKindSchema,
  name: DanbooruTagNameSchema,
  count: z.number().int().min(0),
  work: DanbooruTagNameSchema.nullable().default(null),
  previews: z.array(DonmaiImageUrlSchema).max(3).default([]),
})
export type CreateDanbooruFavorite = z.infer<
  typeof CreateDanbooruFavoriteSchema
>

export const DanbooruFavoriteSchema = CreateDanbooruFavoriteSchema.extend({
  id: z.string(),
  createdAt: z.string(),
  ...LocalNamesShape,
})
export type DanbooruFavorite = z.infer<typeof DanbooruFavoriteSchema>
