'use client'

import { useState, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

import type {
  CardRecipeDetailRecord,
  CreateCardRecipeRequest,
  UpdateCardRecipeRequest,
  CompileRecipeResponse,
} from '@/types'
import {
  listCardRecipesAPI,
  createCardRecipeAPI,
  updateCardRecipeAPI,
  deleteCardRecipeAPI,
  compileCardRecipeAPI,
} from '@/lib/api-client'

export interface UseCardRecipesReturn {
  recipes: CardRecipeDetailRecord[]
  isLoading: boolean
  activeRecipeId: string | null
  setActiveRecipeId: (id: string | null) => void
  create: (
    data: CreateCardRecipeRequest,
  ) => Promise<CardRecipeDetailRecord | null>
  update: (id: string, data: UpdateCardRecipeRequest) => Promise<boolean>
  remove: (id: string) => Promise<boolean>
  compile: (id: string) => Promise<CompileRecipeResponse['data'] | null>
  isCompiling: boolean
  refresh: () => Promise<void>
}

export function useCardRecipes(
  projectId?: string | null,
): UseCardRecipesReturn {
  const [recipes, setRecipes] = useState<CardRecipeDetailRecord[]>([])
  const [activeRecipeId, setActiveRecipeId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isCompiling, setIsCompiling] = useState(false)
  const t = useTranslations('Toasts')

  const refresh = useCallback(async () => {
    setIsLoading(true)
    const result = await listCardRecipesAPI(projectId)
    if (result.success && result.data) {
      setRecipes(result.data)
    }
    setIsLoading(false)
  }, [projectId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const create = useCallback(
    async (
      data: CreateCardRecipeRequest,
    ): Promise<CardRecipeDetailRecord | null> => {
      const result = await createCardRecipeAPI(data)
      if (result.success && result.data) {
        setRecipes((prev) => [result.data!, ...prev])
        toast.success(t('createSuccess'))
        return result.data
      }
      toast.error(result.error ?? t('createFailed'))
      return null
    },
    [t],
  )

  const update = useCallback(
    async (id: string, data: UpdateCardRecipeRequest): Promise<boolean> => {
      const result = await updateCardRecipeAPI(id, data)
      if (result.success && result.data) {
        setRecipes((prev) => prev.map((r) => (r.id === id ? result.data! : r)))
        toast.success(t('updateSuccess'))
        return true
      }
      toast.error(result.error ?? t('updateFailed'))
      return false
    },
    [t],
  )

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      const result = await deleteCardRecipeAPI(id)
      if (result.success) {
        setRecipes((prev) => prev.filter((r) => r.id !== id))
        if (activeRecipeId === id) setActiveRecipeId(null)
        toast.success(t('deleteSuccess'))
        return true
      }
      toast.error(result.error ?? t('deleteFailed'))
      return false
    },
    [activeRecipeId, t],
  )

  const compile = useCallback(
    async (id: string): Promise<CompileRecipeResponse['data'] | null> => {
      setIsCompiling(true)
      try {
        const result = await compileCardRecipeAPI(id)
        if (result.success && result.data) {
          return result.data
        }
        toast.error(result.error ?? 'Compilation failed')
        return null
      } finally {
        setIsCompiling(false)
      }
    },
    [],
  )

  return {
    recipes,
    isLoading,
    activeRecipeId,
    setActiveRecipeId,
    create,
    update,
    remove,
    compile,
    isCompiling,
    refresh,
  }
}
