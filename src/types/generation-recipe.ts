import { z } from 'zod'

/**
 * 生成配方（`p-auto-recipe`，设计见 docs/design/prompt-save.md）。
 *
 * 每张作品在出图那一刻由服务端记下「怎么做出来的」，存进 `Generation.recipe`。
 * 「能不能复刻」不再取决于当时有没有点保存；保存键以后只是收藏。
 * 11-02 owner：先做图和视频，音频 / 3D 以后。
 *
 * ⚠ 这是**读得回来**的契约：字段只加不改；改形状就升 `version`，读的那一侧兼容旧版本。
 */

/** LoRA 既存链接也存当时的名字 / 底模 / 触发词：LoRA 删了，作品仍说得清当时用了什么。 */
export const GenerationRecipeLoraSchema = z.object({
  url: z.string(),
  scale: z.number().optional(),
  /** 当时这把 LoRA 在本人或平台 LoRA 库里的记录；外链没入库的为空。 */
  loraAssetId: z.string().optional(),
  name: z.string().optional(),
  baseModelFamily: z.string().optional(),
  triggerWord: z.string().optional(),
  civitaiModelId: z.number().int().optional(),
  civitaiModelVersionId: z.number().int().optional(),
})
export type GenerationRecipeLora = z.infer<typeof GenerationRecipeLoraSchema>

/**
 * 种子从哪来：`user` = 用户自己填的；`provider` = 这次实际发给 / 回自服务商的那颗
 * （服务商随机挑后回传，或 Runner / fal / Replicate 出图时派发前我们替用户定的）；
 * `unknown` = 服务商自己随机、没回传（这张图换不回原样，只能复刻参数）。
 */
export const GenerationRecipeSeedSourceSchema = z.enum([
  'user',
  'provider',
  'unknown',
])
export type GenerationRecipeSeedSource = z.infer<
  typeof GenerationRecipeSeedSourceSchema
>

const RecipeBaseSchema = z.object({
  version: z.literal(1),
  modelId: z.string(),
  /** 实际发给服务商的提示词（已按这家写法翻译过权重、拿掉 `<lora:…>`）。 */
  prompt: z.string(),
  negativePrompt: z.string().optional(),
  seed: z.number().int().optional(),
  seedSource: GenerationRecipeSeedSourceSchema,
  referenceImages: z.array(z.string()).optional(),
  characterCardIds: z.array(z.string()).optional(),
})

export const ImageGenerationRecipeSchema = RecipeBaseSchema.extend({
  kind: z.literal('image'),
  aspectRatio: z.string().optional(),
  /**
   * 台上的高级参数原样（NAI 角色布局 / 采样器 / 步数 / CFG / 画风串 …都在这里）。
   * ⛔ 不含服务端注入、会过期的那几格（`runnerLoras` 预签名链接、`runnerCheckpoint`）。
   */
  advancedParams: z.record(z.string(), z.unknown()).optional(),
  loras: z.array(GenerationRecipeLoraSchema).optional(),
  imageOperation: z.literal('precise-edit').optional(),
})
export type ImageGenerationRecipe = z.infer<typeof ImageGenerationRecipeSchema>

export const VideoGenerationRecipeSchema = RecipeBaseSchema.extend({
  kind: z.literal('video'),
  workflowId: z.string().optional(),
  aspectRatio: z.string().optional(),
  duration: z.union([z.number(), z.literal('auto')]).optional(),
  resolution: z.string().optional(),
  generateAudio: z.boolean().optional(),
  videoUrls: z.array(z.string()).optional(),
  audioUrls: z.array(z.string()).optional(),
})
export type VideoGenerationRecipe = z.infer<typeof VideoGenerationRecipeSchema>

export const GenerationRecipeSchema = z.discriminatedUnion('kind', [
  ImageGenerationRecipeSchema,
  VideoGenerationRecipeSchema,
])
export type GenerationRecipe = z.infer<typeof GenerationRecipeSchema>

/** 配方里可能缺的东西（旧作品从旧记录补时补不全）。界面按它写「配方不完整：缺底模」。 */
export const GenerationRecipeGapSchema = z.enum([
  /** 整份配方都没有（视频 / 旧作品没留参数）。 */
  'recipe',
  /** 随机种子没留下，只能复刻参数、换不回原图。 */
  'seed',
  /** LoRA 只剩链接和权重，名字 / 底模 / 触发词不知道。 */
  'loraDetails',
])
export type GenerationRecipeGap = z.infer<typeof GenerationRecipeGapSchema>

export interface GenerationRecipeRead {
  generationId: string
  /** `stored` = 出图时记下的；`derived` = 旧作品从旧快照现补的；`none` = 补不出来。 */
  source: 'stored' | 'derived' | 'none'
  recipe: GenerationRecipe | null
  gaps: GenerationRecipeGap[]
}
