import { z } from 'zod'

import {
  USER_IMAGE_UPLOAD_ACCEPTED_MIME_TYPES,
  USER_UPLOAD_MAX_BYTES,
} from '@/constants/uploads'

export const ImageRecipePrepareRequestSchema = z.object({
  mimeType: z.enum(USER_IMAGE_UPLOAD_ACCEPTED_MIME_TYPES),
  sizeBytes: z.number().int().positive().max(USER_UPLOAD_MAX_BYTES),
})
export type ImageRecipePrepareRequest = z.infer<
  typeof ImageRecipePrepareRequestSchema
>

export interface ImageRecipePrepare {
  uploadUrl: string
  storageKey: string
  headers: Record<string, string>
}

/** 本地图走直传后的临时键；素材库里的图给它那一行的 id。 */
export const ImageRecipeReadRequestSchema = z.union([
  z.object({ storageKey: z.string().trim().min(1).max(300) }),
  z.object({ generationId: z.string().trim().min(1).max(100) }),
])
export type ImageRecipeReadRequest = z.infer<
  typeof ImageRecipeReadRequestSchema
>

const ImageRecipeCharacterSchema = z.object({
  prompt: z.string(),
  negative: z.string(),
  center: z.object({ x: z.number(), y: z.number() }).nullable(),
})

/**
 * 图的配方：NovelAI / A1111 写进文件的那份，或（素材库里本站出的图）那一行记下的配方
 * （`library`，`model` 是模型 id）。seed 用字符串：可能超出 JS 安全整数。
 */
export const ImageRecipeEmbeddedSchema = z.object({
  source: z.enum(['novelai', 'a1111', 'library']),
  model: z.string().nullable(),
  prompt: z.string(),
  negative: z.string(),
  characters: z.array(ImageRecipeCharacterSchema),
  manualPositions: z.boolean(),
  steps: z.number().nullable(),
  cfg: z.number().nullable(),
  sampler: z.string().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  seed: z.string().nullable(),
})
export type ImageRecipeEmbedded = z.infer<typeof ImageRecipeEmbeddedSchema>

/** 没配方时 Tagger 认出的（Danbooru 原名，带下划线）。 */
export const ImageRecipeTagsSchema = z.object({
  artist: z.array(z.string()),
  character: z.array(z.string()),
  general: z.array(z.string()),
})
export type ImageRecipeTags = z.infer<typeof ImageRecipeTagsSchema>

export const ImageRecipeReadingSchema = z.object({
  recipe: ImageRecipeEmbeddedSchema.nullable(),
  tags: ImageRecipeTagsSchema.nullable(),
})
export type ImageRecipeReading = z.infer<typeof ImageRecipeReadingSchema>
