'use client'

import { useMemo } from 'react'

import { RecipeCharacterLinkSchema, type RecipeRecord } from '@/types'
import { useRecipes } from '@/hooks/prompts/use-recipes'

/** 模板挂在哪个角色·造型（存成模板框写进 `params.characterLink`）。 */
export function recipeCharacterLink(recipe: Pick<RecipeRecord, 'params'>) {
  const params = recipe.params
  if (!params || typeof params !== 'object') return null
  const parsed = RecipeCharacterLinkSchema.safeParse(
    (params as Record<string, unknown>).characterLink,
  )
  return parsed.success ? parsed.data : null
}

/**
 * 角色页「模板」页签（owner 11-01 定 C + 甲）：她名下的模板按造型分好。
 * 列表就是提示词库那一份会话缓存（`useRecipes`），⛔ 另起接口。
 */
export function useCharacterTemplates(cardId: string) {
  const { recipes, isLoading } = useRecipes(true)
  const byLook = useMemo(() => {
    const map = new Map<string, RecipeRecord[]>()
    for (const recipe of recipes) {
      const link = recipeCharacterLink(recipe)
      if (link?.cardId !== cardId) continue
      const list = map.get(link.lookId) ?? []
      list.push(recipe)
      map.set(link.lookId, list)
    }
    for (const list of map.values())
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return map
  }, [cardId, recipes])
  return { byLook, isLoading }
}
