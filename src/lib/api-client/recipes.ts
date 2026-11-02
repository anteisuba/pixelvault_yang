import { API_ENDPOINTS } from '@/constants/config'
import type {
  CreateRecipeFromGenerationRequest,
  CreateRecipeRequest,
  GenerationRecord,
  RecipeRecord,
} from '@/types'

import { getErrorPayload } from '@/lib/api-client/shared'
import { apiFetch } from '@/lib/api-client/api-fetch'
import { getThrownErrorFields } from '@/lib/api-client/error-fields'

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

export async function createRecipeAPI(
  data: CreateRecipeRequest,
): Promise<RecipeApiResponse<RecipeRecord>> {
  try {
    const response = await apiFetch(API_ENDPOINTS.RECIPES, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: stringifyRecipeRequest(data),
    })

    if (!response.ok) {
      return {
        success: false,
        ...(await getErrorPayload(response)),
      }
    }

    return await response.json()
  } catch (error) {
    return { success: false, ...getThrownErrorFields(error) }
  }
}

export async function createRecipeFromGenerationAPI(
  data: CreateRecipeFromGenerationRequest,
): Promise<RecipeApiResponse<RecipeRecord>> {
  try {
    const response = await apiFetch(
      `${API_ENDPOINTS.RECIPES}/from-generation`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      },
    )

    if (!response.ok) {
      return {
        success: false,
        ...(await getErrorPayload(response)),
      }
    }

    return await response.json()
  } catch (error) {
    return { success: false, ...getThrownErrorFields(error) }
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
    const response = await apiFetch(`${API_ENDPOINTS.RECIPES}?${params}`)

    if (!response.ok) {
      return {
        success: false,
        ...(await getErrorPayload(response)),
      }
    }

    return await response.json()
  } catch (error) {
    return { success: false, ...getThrownErrorFields(error) }
  }
}

export async function getRecipeAPI(
  id: string,
): Promise<RecipeApiResponse<RecipeRecord>> {
  try {
    const response = await apiFetch(getRecipeUrl(id))

    if (!response.ok) {
      return {
        success: false,
        ...(await getErrorPayload(response)),
      }
    }

    return await response.json()
  } catch (error) {
    return { success: false, ...getThrownErrorFields(error) }
  }
}

export async function updateRecipeAPI(
  id: string,
  data: CreateRecipeRequest,
): Promise<RecipeApiResponse<RecipeRecord>> {
  try {
    const response = await apiFetch(getRecipeUrl(id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: stringifyRecipeRequest(data),
    })

    if (!response.ok) {
      return {
        success: false,
        ...(await getErrorPayload(response)),
      }
    }

    return await response.json()
  } catch (error) {
    return { success: false, ...getThrownErrorFields(error) }
  }
}

/** 「使用」记一次最近使用时间（pages/prompts.md）。 */
export async function markRecipeUsedAPI(
  id: string,
): Promise<RecipeApiResponse<{ id: string; lastUsedAt: string }>> {
  try {
    const response = await apiFetch(`${getRecipeUrl(id)}/use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })

    if (!response.ok) {
      return {
        success: false,
        ...(await getErrorPayload(response)),
      }
    }

    return await response.json()
  } catch (error) {
    return { success: false, ...getThrownErrorFields(error) }
  }
}

/** 库左栏「收藏」：收藏 / 取消收藏一条提示词。 */
export async function setRecipeFavoriteAPI(
  id: string,
  isFavorite: boolean,
): Promise<RecipeApiResponse<{ id: string; isFavorite: boolean }>> {
  try {
    const response = await apiFetch(`${getRecipeUrl(id)}/favorite`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isFavorite }),
    })

    if (!response.ok) {
      return {
        success: false,
        ...(await getErrorPayload(response)),
      }
    }

    return await response.json()
  } catch (error) {
    return { success: false, ...getThrownErrorFields(error) }
  }
}

export async function listRecipeGenerationsAPI(
  id: string,
): Promise<RecipeApiResponse<GenerationRecord[]>> {
  try {
    const response = await apiFetch(`${getRecipeUrl(id)}/generations`)

    if (!response.ok) {
      return {
        success: false,
        ...(await getErrorPayload(response)),
      }
    }

    return await response.json()
  } catch (error) {
    return { success: false, ...getThrownErrorFields(error) }
  }
}

export async function deleteRecipeAPI(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await apiFetch(getRecipeUrl(id), {
      method: 'DELETE',
    })

    if (!response.ok) {
      return {
        success: false,
        ...(await getErrorPayload(response)),
      }
    }

    return { success: true }
  } catch (error) {
    return { success: false, ...getThrownErrorFields(error) }
  }
}
