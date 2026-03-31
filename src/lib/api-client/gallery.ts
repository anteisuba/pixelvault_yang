import type { GalleryResponse } from '@/types'
import { API_ENDPOINTS, PAGINATION } from '@/constants/config'

import { getErrorMessage, getErrorPayload } from '@/lib/api-client/shared'

export async function fetchGalleryImages(
  page: number = PAGINATION.DEFAULT_PAGE,
  limit: number = PAGINATION.DEFAULT_LIMIT,
  filters?: {
    search?: string
    model?: string
    sort?: string
    type?: string
    mine?: boolean
  },
): Promise<GalleryResponse> {
  try {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    })
    if (filters?.search) params.set('search', filters.search)
    if (filters?.model) params.set('model', filters.model)
    if (filters?.sort) params.set('sort', filters.sort)
    if (filters?.type && filters.type !== 'all') {
      params.set('type', filters.type)
    }
    if (filters?.mine) params.set('mine', '1')

    const response = await fetch(`${API_ENDPOINTS.IMAGES}?${params.toString()}`)
    if (!response.ok) {
      const payload = await getErrorPayload(
        response,
        `Failed with status ${response.status}`,
      )
      return {
        success: false,
        error: payload.error,
        errorCode: payload.errorCode,
        i18nKey: payload.i18nKey,
      }
    }
    return await response.json()
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}

export async function deleteGenerationAPI(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_ENDPOINTS.GENERATIONS}/${id}`, {
      method: 'DELETE',
    })
    if (response.status === 204) return { success: true }
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
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}

export async function batchDeleteGenerationsAPI(ids: string[]): Promise<{
  success: boolean
  data?: { deletedCount: number }
  error?: string
}> {
  try {
    const response = await fetch(`${API_ENDPOINTS.GENERATIONS}/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', ids }),
    })
    return await response.json()
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}

export async function batchUpdateVisibilityAPI(
  ids: string[],
  field: 'isPublic' | 'isPromptPublic',
  value: boolean,
): Promise<{
  success: boolean
  data?: { updatedCount: number }
  error?: string
}> {
  try {
    const response = await fetch(`${API_ENDPOINTS.GENERATIONS}/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'visibility', ids, field, value }),
    })
    return await response.json()
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}
