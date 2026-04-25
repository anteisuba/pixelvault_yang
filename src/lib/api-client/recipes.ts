import type { CreateRecipeRequest, RecipeRecord } from '@/types'
import { API_ENDPOINTS } from '@/constants/config'

import { getErrorMessage } from '@/lib/api-client/shared'

export interface RecipeApiResponse<TData> {
  success: boolean
  data?: TData
  error?: string
}

export type RecipesApiResponse = RecipeApiResponse<{
  recipes: RecipeRecord[]
  total: number
}>

function stringifyRecipeRequest(data: CreateRecipeRequest): string {
  return JSON.stringify(data, (_key, value: unknown) => {
    if (typeof value === 'bigint') return value.toString()
    return value
  })
}

function getRecipeUrl(id: string): string {
  return `${API_ENDPOINTS.RECIPES}/${encodeURIComponent(id)}`
}

function getUnexpectedErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred'
}

export async function createRecipeAPI(
  data: CreateRecipeRequest,
): Promise<RecipeApiResponse<RecipeRecord>> {
  try {
    const response = await fetch(API_ENDPOINTS.RECIPES, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: stringifyRecipeRequest(data),
    })

    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Failed with status ${response.status}`,
        ),
      }
    }

    return await response.json()
  } catch (error) {
    return { success: false, error: getUnexpectedErrorMessage(error) }
  }
}

export async function listRecipesAPI(
  page = 1,
  limit = 20,
): Promise<RecipesApiResponse> {
  try {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    })
    const response = await fetch(`${API_ENDPOINTS.RECIPES}?${params}`)

    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Failed with status ${response.status}`,
        ),
      }
    }

    return await response.json()
  } catch (error) {
    return { success: false, error: getUnexpectedErrorMessage(error) }
  }
}

export async function getRecipeAPI(
  id: string,
): Promise<RecipeApiResponse<RecipeRecord>> {
  try {
    const response = await fetch(getRecipeUrl(id))

    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Failed with status ${response.status}`,
        ),
      }
    }

    return await response.json()
  } catch (error) {
    return { success: false, error: getUnexpectedErrorMessage(error) }
  }
}

export async function deleteRecipeAPI(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(getRecipeUrl(id), {
      method: 'DELETE',
    })

    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Failed with status ${response.status}`,
        ),
      }
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: getUnexpectedErrorMessage(error) }
  }
}
