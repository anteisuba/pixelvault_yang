import type {
  GenerateRequest,
  GenerateResponse,
  GalleryResponse,
  CreateApiKeyRequest,
  UpdateApiKeyRequest,
  ApiKeysResponse,
  ApiKeyResponse,
} from '@/types'
import { API_ENDPOINTS } from '@/constants/config'

/**
 * Call the image generation API.
 *
 * @param params - Generation parameters (prompt, modelId, aspectRatio)
 * @returns The generation response with image URL or error details
 */
export async function generateImageAPI(
  params: GenerateRequest,
): Promise<GenerateResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.GENERATE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })

    // Handle non-OK HTTP responses
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      const message =
        errorData?.error ?? `Generation failed with status ${response.status}`
      return { success: false, error: message }
    }

    const data: GenerateResponse = await response.json()
    return data
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

// ─── API Key Management ───────────────────────────────────────────

export async function listApiKeys(): Promise<ApiKeysResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.API_KEYS)
    if (!response.ok) {
      return { success: false, error: `Failed with status ${response.status}` }
    }
    return await response.json()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

export async function createApiKey(data: CreateApiKeyRequest): Promise<ApiKeyResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.API_KEYS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      return { success: false, error: errorData?.error ?? `Failed with status ${response.status}` }
    }
    return await response.json()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

export async function updateApiKey(
  id: string,
  data: UpdateApiKeyRequest,
): Promise<ApiKeyResponse> {
  try {
    const response = await fetch(`${API_ENDPOINTS.API_KEYS}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      return { success: false, error: errorData?.error ?? `Failed with status ${response.status}` }
    }
    return await response.json()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

export async function deleteApiKey(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_ENDPOINTS.API_KEYS}/${id}`, {
      method: 'DELETE',
    })
    if (response.status === 204) return { success: true }
    if (!response.ok) {
      const errorData = await response.json().catch(() => null)
      return { success: false, error: errorData?.error ?? `Failed with status ${response.status}` }
    }
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

/**
 * Fetch public gallery images with pagination
 */
export async function fetchGalleryImages(
  page: 1,
  limit: 20,
): Promise<GalleryResponse> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.IMAGES}?page=${page}&limit=${limit}`,
    )
    if (!response.ok) {
      return { success: false, error: 'Failed with status ${response.status}' }
    }
    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}
