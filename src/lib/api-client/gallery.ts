import type {
  AssetSectionCounts,
  GalleryResponse,
  GenerationRecord,
} from '@/types'
import { API_ENDPOINTS, CLIENT_API, PAGINATION } from '@/constants/config'

import { getErrorMessage, getErrorPayload } from '@/lib/api-client/shared'

export async function fetchGalleryImages(
  page: number = PAGINATION.DEFAULT_PAGE,
  limit: number = PAGINATION.DEFAULT_LIMIT,
  filters?: {
    search?: string
    model?: string
    sort?: string
    type?: string
    timeRange?: string
    liked?: boolean
    published?: boolean
    mine?: boolean
    /**
     * Project scope: a project UUID, the literal "none" for unassigned
     * generations only, or omit/empty for all projects.
     */
    projectId?: string
    /** Filter by Generation.provider (e.g. 'user-upload' for local assets). */
    provider?: string
  },
  cursor?: string | null,
): Promise<GalleryResponse> {
  try {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    })
    if (cursor) params.set('cursor', cursor)
    if (filters?.search) params.set('search', filters.search)
    if (filters?.model) params.set('model', filters.model)
    if (filters?.sort) params.set('sort', filters.sort)
    if (filters?.type && filters.type !== 'all') {
      params.set('type', filters.type)
    }
    if (filters?.timeRange && filters.timeRange !== 'all') {
      params.set('timeRange', filters.timeRange)
    }
    if (filters?.liked) params.set('liked', '1')
    if (filters?.published) params.set('published', '1')
    if (filters?.mine) params.set('mine', '1')
    if (filters?.projectId) params.set('projectId', filters.projectId)
    if (filters?.provider) params.set('provider', filters.provider)

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

/**
 * Fetch the full owner-scoped generation row (including snapshot) for
 * detail-style consumers like the Studio remix bootstrap. Slim list
 * payloads intentionally exclude snapshot, so the cross-route remix
 * flow uses this endpoint to rebuild the original preset.
 */
export async function fetchGenerationByIdAPI(
  id: string,
): Promise<
  { success: true; data: GenerationRecord } | { success: false; error: string }
> {
  try {
    const response = await fetch(`${API_ENDPOINTS.GENERATIONS}/${id}`)
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

/**
 * Move a generation between folders (or unset it). `projectId === null`
 * sends it back to Unassigned.
 */
export async function assignGenerationProjectAPI(
  id: string,
  projectId: string | null,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_ENDPOINTS.GENERATIONS}/${id}/project`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId }),
      signal: AbortSignal.timeout(CLIENT_API.ACTION_TIMEOUT_MS),
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
      signal: AbortSignal.timeout(CLIENT_API.ACTION_TIMEOUT_MS),
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
      signal: AbortSignal.timeout(CLIENT_API.ACTION_TIMEOUT_MS),
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
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}

export type AssetSectionCountsResponse =
  | { success: true; data: AssetSectionCounts }
  | { success: false; error: string }

/**
 * Fetch the aggregate counts powering the /assets right-sidebar.
 */
export async function fetchAssetSectionCounts(): Promise<AssetSectionCountsResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.ASSET_SECTION_COUNTS)
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
      signal: AbortSignal.timeout(CLIENT_API.ACTION_TIMEOUT_MS),
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
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}

export async function batchSetLikeAPI(
  ids: string[],
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
      body: JSON.stringify({ action: 'like', ids, value }),
      signal: AbortSignal.timeout(CLIENT_API.ACTION_TIMEOUT_MS),
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
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}

export async function batchAssignProjectAPI(
  ids: string[],
  projectId: string | null,
): Promise<{
  success: boolean
  data?: { updatedCount: number }
  error?: string
}> {
  try {
    const response = await fetch(`${API_ENDPOINTS.GENERATIONS}/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'project', ids, projectId }),
      signal: AbortSignal.timeout(CLIENT_API.ACTION_TIMEOUT_MS),
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
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}
