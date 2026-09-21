import { getModelById, IMAGE_KIND, resolveImageKind } from '@/constants/models'
import type { RecipeRecord } from '@/types'

export function getRecipeTemplateKind(
  recipe: RecipeRecord,
): RecipeRecord['outputType'] | 'LORA' {
  if (recipe.outputType !== 'IMAGE') return recipe.outputType
  const model = getModelById(recipe.modelId)
  if (model && resolveImageKind(model) === IMAGE_KIND.LORA_BASE) return 'LORA'
  if (recipe.params && typeof recipe.params === 'object') {
    const params = recipe.params as Record<string, unknown>
    const advanced = params.advancedParams
    if (
      advanced &&
      typeof advanced === 'object' &&
      'loras' in advanced &&
      Array.isArray(advanced.loras) &&
      advanced.loras.length > 0
    )
      return 'LORA'
  }
  return 'IMAGE'
}
