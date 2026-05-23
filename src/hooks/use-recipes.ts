'use client'

import { useCallback, useEffect, useState } from 'react'

import { listRecipesAPI } from '@/lib/api-client/recipes'
import type { RecipeRecord } from '@/types'

let recipeCache: RecipeRecord[] | null = null

export function useRecipes(enabled = true) {
  const [recipes, setRecipes] = useState<RecipeRecord[]>(
    () => recipeCache ?? [],
  )
  const [isLoading, setIsLoading] = useState(false)

  const load = useCallback(
    async (force = false) => {
      if (!enabled) return
      if (!force && recipeCache) {
        setRecipes(recipeCache)
        return
      }

      setIsLoading(true)
      try {
        const result = await listRecipesAPI(1, 20)
        if (result.success && result.data) {
          recipeCache = result.data.recipes
          setRecipes(result.data.recipes)
        }
      } finally {
        setIsLoading(false)
      }
    },
    [enabled],
  )

  const addRecipe = useCallback((recipe: RecipeRecord) => {
    recipeCache = [
      recipe,
      ...(recipeCache ?? []).filter((item) => item.id !== recipe.id),
    ].slice(0, 20)
    setRecipes(recipeCache)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const refresh = useCallback(() => load(true), [load])

  return { recipes, isLoading, refresh, addRecipe }
}
