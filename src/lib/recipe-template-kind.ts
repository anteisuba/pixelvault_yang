import { getModelById, IMAGE_KIND, resolveImageKind } from '@/constants/models'
import type { PromptDialect } from '@/constants/prompt-dialects'
import { readRecipeLoraSetup } from '@/lib/recipe-lora-setup'
import type { OutputType, RecipeRecord } from '@/types'
import { TagTemplateParamsSchema } from '@/types/tag-composer'

/**
 * 模板的类型（pages/prompts.md）：出图类型之外多一个 `TAGS` —— 写 Danbooru 标签的
 * 三种来处合成一格（owner 2026-09-28，NAI + LoRA 合一）。
 */
export type RecipeTemplateKind = RecipeRecord['outputType'] | 'TAGS'

/**
 * 标签模板从哪来 —— 它决定「使用」换掉什么：`tags` = 标签台存的（整组），`lora` =
 * LoRA 台存的（整套），`prompts` = 在提示词页新建的（只有标签与负面）。
 */
export type TagTemplateSource = 'tags' | 'lora' | 'prompts'

type RecipeKindTarget = Pick<RecipeRecord, 'outputType' | 'modelId' | 'params'>

export function getTagTemplateSource(
  recipe: RecipeKindTarget,
): TagTemplateSource | null {
  if (recipe.outputType !== 'IMAGE') return null
  const model = getModelById(recipe.modelId)
  // LoRA 台存的整套与素材库存的链接 + 权重，与卡片上那一行同一个读法。
  if (
    (model && resolveImageKind(model) === IMAGE_KIND.LORA_BASE) ||
    readRecipeLoraSetup(recipe.params)
  )
    return 'lora'
  const tagParams = TagTemplateParamsSchema.safeParse(recipe.params)
  if (!tagParams.success) return null
  return tagParams.data.origin === 'prompts' ? 'prompts' : 'tags'
}

export function getRecipeTemplateKind(
  recipe: RecipeKindTarget,
): RecipeTemplateKind {
  if (recipe.outputType !== 'IMAGE') return recipe.outputType
  return getTagTemplateSource(recipe) ? 'TAGS' : 'IMAGE'
}

/** 标签式模板：三种来处写的都是 Danbooru 标签，⛔ 不是一句话的自然语言。 */
export function isTagStyleRecipe(recipe: RecipeKindTarget): boolean {
  return getTagTemplateSource(recipe) !== null
}

/**
 * 这一台列哪些模板（owner 2026-09-26）：标签台（NAI）只列标签式模板，图片台只列
 * 图片的，视频台只列视频的 —— 每台只看得到自己能用的那一种，⛔ 不再在弹层里给一排
 * 「全部 / 图片 / 视频 / 标签」让人自己筛。
 */
export function matchesRecipeTemplateScope(
  recipe: RecipeRecord,
  dialect: PromptDialect,
  outputType: OutputType,
): boolean {
  const tagStyle = isTagStyleRecipe(recipe)
  if (dialect === 'tags') return tagStyle
  return !tagStyle && recipe.outputType === outputType
}
