import { API_ENDPOINTS } from '@/constants/config'
import type { CivitaiLoraBaseModel, CivitaiLoraSort } from '@/constants/lora'
import type {
  CivitaiLoraLibraryResult,
  FavoriteLoraRequest,
  LoraAssetRecord,
} from '@/types'

import { getErrorMessage } from '@/lib/api-client/shared'

interface ListResponse {
  success: boolean
  data?: LoraAssetRecord[]
  error?: string
}

interface SingleResponse {
  success: boolean
  data?: LoraAssetRecord
  error?: string
  errorCode?: string
}

interface CivitaiListResponse {
  success: boolean
  data?: CivitaiLoraLibraryResult
  error?: string
}

export async function listLoraAssetsAPI(): Promise<ListResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.LORA_ASSETS)
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Failed with status ${response.status}`,
        ),
      }
    }
    return (await response.json()) as ListResponse
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    }
  }
}

export async function listDiscoverLoraAssetsAPI(): Promise<ListResponse> {
  try {
    const response = await fetch(`${API_ENDPOINTS.LORA_ASSETS}/discover`)
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Failed with status ${response.status}`,
        ),
      }
    }
    return (await response.json()) as ListResponse
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    }
  }
}

export async function listCivitaiLoraAssetsAPI(params: {
  page?: number
  pageSize?: number
  cursor?: string | null
  search?: string
  baseModel?: CivitaiLoraBaseModel
  sort?: CivitaiLoraSort
}): Promise<CivitaiListResponse> {
  try {
    const query = new URLSearchParams()
    if (params.page) query.set('page', String(params.page))
    if (params.pageSize) query.set('pageSize', String(params.pageSize))
    if (params.cursor) query.set('cursor', params.cursor)
    if (params.search) query.set('search', params.search)
    if (params.baseModel) query.set('baseModel', params.baseModel)
    if (params.sort) query.set('sort', params.sort)

    const response = await fetch(
      `${API_ENDPOINTS.LORA_ASSETS_CIVITAI}?${query.toString()}`,
    )
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Failed with status ${response.status}`,
        ),
      }
    }
    return (await response.json()) as CivitaiListResponse
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    }
  }
}

interface SingleAssetResponse {
  success: boolean
  data?: LoraAssetRecord
  error?: string
  errorCode?: string
}

export async function setLoraAssetVisibilityAPI(
  loraAssetId: string,
  isPublic: boolean,
): Promise<SingleAssetResponse> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.LORA_ASSETS}/${encodeURIComponent(loraAssetId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublic }),
      },
    )
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Failed with status ${response.status}`,
        ),
      }
    }
    return (await response.json()) as SingleAssetResponse
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    }
  }
}

export async function favoriteLoraAPI(
  input: FavoriteLoraRequest,
): Promise<SingleAssetResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.LORA_ASSETS_FAVORITE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
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
    return (await response.json()) as SingleAssetResponse
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    }
  }
}

export async function unfavoriteLoraAPI(
  assetId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.LORA_ASSETS_FAVORITE}?assetId=${encodeURIComponent(assetId)}`,
      { method: 'DELETE' },
    )
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
      error: error instanceof Error ? error.message : 'Network error',
    }
  }
}

export async function getLoraAssetByCodeAPI(
  code: string,
): Promise<SingleResponse> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.LORA_ASSET_BY_CODE}/${encodeURIComponent(code)}`,
    )
    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: 'Not found', errorCode: 'NOT_FOUND' }
      }
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Failed with status ${response.status}`,
        ),
      }
    }
    return (await response.json()) as SingleResponse
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    }
  }
}
