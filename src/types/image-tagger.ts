import { z } from 'zod'

/** 一条：Danbooru 标签名 + 置信度（0–1）。 */
const TaggerEntriesSchema = z
  .array(z.tuple([z.string(), z.number()]))
  .catch([])
  .default([])

/**
 * PixAI Tagger 认一张图的结果（Modal `/tag` 原样）：每类已过模型卡推荐阈值、按分数从高到低。
 * 缺的类当空。
 */
export const ImageTaggerResultSchema = z.object({
  style: TaggerEntriesSchema,
  character: TaggerEntriesSchema,
  copyright: TaggerEntriesSchema,
  general: TaggerEntriesSchema,
  meta: TaggerEntriesSchema,
  rating: TaggerEntriesSchema,
})
export type ImageTaggerResult = z.infer<typeof ImageTaggerResultSchema>
