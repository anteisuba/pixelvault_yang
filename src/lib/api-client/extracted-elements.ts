import { API_ENDPOINTS } from '@/constants/config'
import type {
  ExtractedElementCreateRequest,
  ExtractedElementRecord,
} from '@/types'

import { getErrorMessage } from '@/lib/api-client/shared'

interface ListResponse {
  success: boolean
  data?: { items: ExtractedElementRecord[]; nextCursor: string | null }
  error?: string
}

interface SingleResponse {
  success: boolean
  data?: ExtractedElementRecord
  error?: string
  errorCode?: string
}

interface DeleteResponse {
  success: boolean
  error?: string
}

export async function listExtractedElementsAPI(params?: {
  limit?: number
  cursor?: string
}): Promise<ListResponse> {
  try {
    const query = new URLSearchParams()
    if (params?.limit) query.set('limit', String(params.limit))
    if (params?.cursor) query.set('cursor', params.cursor)
    const suffix = query.toString() ? `?${query.toString()}` : ''
    const response = await fetch(`${API_ENDPOINTS.EXTRACTED_ELEMENTS}${suffix}`)
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

export async function createExtractedElementAPI(
  input: ExtractedElementCreateRequest,
): Promise<SingleResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.EXTRACTED_ELEMENTS, {
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
    return (await response.json()) as SingleResponse
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    }
  }
}

export async function deleteExtractedElementAPI(
  id: string,
): Promise<DeleteResponse> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.EXTRACTED_ELEMENTS}/${encodeURIComponent(id)}`,
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
