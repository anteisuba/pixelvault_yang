'use client'

import { useCallback, useEffect, useState } from 'react'

import { listRecipesAPI } from '@/lib/api-client/recipes'
import type { RecipeRecord } from '@/types'

export function useRecipes(enabled = true) {
  const [recipes, setRecipes] = useState<RecipeRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const load = useCallback(async () => {
    if (!enabled) return
    setIsLoading(true)
    try {
      const result = await listRecipesAPI(1, 20)
      if (result.success && result.data) {
        setRecipes(result.data.recipes)
      }
    } finally {
      setIsLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    void load()
  }, [load])

  return { recipes, isLoading, refresh: load }
}
