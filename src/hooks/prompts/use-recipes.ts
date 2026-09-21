'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { listRecipesAPI } from '@/lib/api-client/recipes'
import type { RecipeRecord } from '@/types'

export function useRecipes(enabled = true) {
  const [recipes, setRecipes] = useState<RecipeRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(false)
  const requestId = useRef(0)
  const additions = useRef<RecipeRecord[]>([])

  const refresh = useCallback(async () => {
    if (!enabled) return
    const id = ++requestId.current
    setIsLoading(true)
    setError(false)
    try {
      const loaded: RecipeRecord[] = []
      for (let page = 1; ; page++) {
        const result = await listRecipesAPI(page, 50)
        if (id !== requestId.current) return
        if (!result.success || !result.data)
          throw new Error('Recipe load failed')
        loaded.push(...result.data.recipes)
        if (loaded.length >= result.data.total) break
        if (result.data.recipes.length === 0)
          throw new Error('Incomplete recipe list')
      }
      const merged = new Map(loaded.map((recipe) => [recipe.id, recipe]))
      for (const recipe of additions.current) merged.set(recipe.id, recipe)
      setRecipes([...merged.values()])
      additions.current = []
    } catch {
      if (id === requestId.current) setError(true)
    } finally {
      if (id === requestId.current) setIsLoading(false)
    }
  }, [enabled])

  const addRecipe = useCallback((recipe: RecipeRecord) => {
    additions.current.push(recipe)
    setRecipes((current) => [
      recipe,
      ...current.filter((item) => item.id !== recipe.id),
    ])
  }, [])

  useEffect(() => {
    const pendingRequest = requestId
    void refresh()
    return () => {
      pendingRequest.current++
    }
  }, [refresh])

  return { recipes, isLoading, error, refresh, addRecipe }
}
