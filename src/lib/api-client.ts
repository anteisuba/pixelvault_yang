import type {
  GenerateRequest,
  GenerateResponse,
  GalleryResponse,
  CreateApiKeyRequest,
  UpdateApiKeyRequest,
  ApiKeysResponse,
  ApiKeyResponse,
  ToggleVisibilityResponse,
  UsageSummary,
} from '@/types'
import { UsageSummarySchema } from '@/types'
import { API_ENDPOINTS, PAGINATION } from '@/constants/config'

interface ApiErrorPayload {
  error?: string
}

async function getErrorMessage(
  response: Response,
  fallbackMessage: string,
): Promise<string> {
  const errorData = (await response
    .json()
    .catch(() => null)) as ApiErrorPayload | null

  return errorData?.error ?? fallbackMessage
}

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
      const message = await getErrorMessage(
        response,
        `Generation failed with status ${response.status}`,
      )
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
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

export async function createApiKey(
  data: CreateApiKeyRequest,
): Promise<ApiKeyResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.API_KEYS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
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
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
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
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

export async function deleteApiKey(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_ENDPOINTS.API_KEYS}/${id}`, {
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
    return { success: true }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

export async function fetchUsageSummary(): Promise<UsageSummary> {
  const response = await fetch(API_ENDPOINTS.USAGE_SUMMARY)

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, `Failed with status ${response.status}`),
    )
  }

  return UsageSummarySchema.parse(await response.json())
}

/**
 * Toggle the isPublic visibility of a generation owned by the current user.
 */
export async function toggleGenerationVisibility(
  id: string,
): Promise<ToggleVisibilityResponse> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.GENERATIONS}/${id}/visibility`,
      { method: 'PATCH' },
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
    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

/**
 * Fetch public gallery images with pagination
 */
export async function fetchGalleryImages(
  page: number = PAGINATION.DEFAULT_PAGE,
  limit: number = PAGINATION.DEFAULT_LIMIT,
): Promise<GalleryResponse> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.IMAGES}?page=${page}&limit=${limit}`,
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
    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}
