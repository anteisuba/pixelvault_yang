import { getModelById, IMAGE_KIND, resolveImageKind } from '@/constants/models'
import type { PromptDialect } from '@/constants/prompt-dialects'
import { readRecipeLoraSetup } from '@/lib/recipe-lora-setup'
import { isTagTemplateParams } from '@/lib/tag-composer'
import type { OutputType, RecipeRecord } from '@/types'

export function getRecipeTemplateKind(
  recipe: Pick<RecipeRecord, 'outputType' | 'modelId' | 'params'>,
): RecipeRecord['outputType'] | 'LORA' {
  if (recipe.outputType !== 'IMAGE') return recipe.outputType
  const model = getModelById(recipe.modelId)
  if (model && resolveImageKind(model) === IMAGE_KIND.LORA_BASE) return 'LORA'
  // LoRA 台存的整套与素材库存的链接 + 权重，与卡片上那一行同一个读法。
  return readRecipeLoraSetup(recipe.params) ? 'LORA' : 'IMAGE'
}

/**
 * 标签式模板：标签台存的（`promptDialect: 'tags'`）与 LoRA 模板 —— 两者写的都是
 * Danbooru 标签，⛔ 不是一句话的自然语言。
 */
export function isTagStyleRecipe(recipe: RecipeRecord): boolean {
  return (
    isTagTemplateParams(recipe.params) ||
    getRecipeTemplateKind(recipe) === 'LORA'
  )
}

/**
 * 这一台列哪些模板（owner 2026-09-26）：标签台（NAI）只列标签式模板（LoRA 与标签台
 * 存的），图片台只列图片的，视频台只列视频的 —— 每台只看得到自己能用的那一种，
 * ⛔ 不再在弹层里给一排「全部 / 图片 / 视频 / LoRA」让人自己筛。
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
