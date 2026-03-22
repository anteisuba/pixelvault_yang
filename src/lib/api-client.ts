import type {
  GenerateRequest,
  GenerateResponse,
  GenerateVideoRequest,
  GenerateVideoResponse,
  GalleryResponse,
  CreateApiKeyRequest,
  UpdateApiKeyRequest,
  ApiKeysResponse,
  ApiKeyResponse,
  ToggleVisibilityResponse,
  UsageSummary,
  EnhancePromptRequest,
  EnhancePromptResponse,
  AnalyzeImageRequest,
  AnalyzeImageResponse,
  GenerateVariationsRequest,
  GenerateVariationsResponse,
  CreateArenaMatchRequest,
  CreateArenaMatchResponse,
  ArenaMatchResponse,
  ArenaVoteRequest,
  ArenaVoteResponse,
  ArenaLeaderboardResponse,
  CreateStoryRequest,
  CreateStoryResponse,
  StoryResponse,
  StoryListResponse,
  UpdateStoryRequest,
  GenerateNarrativeRequest,
  GenerateNarrativeResponse,
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

// ─── Video Generation ─────────────────────────────────────────────

export async function generateVideoAPI(
  params: GenerateVideoRequest,
): Promise<GenerateVideoResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.GENERATE_VIDEO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      const message = await getErrorMessage(
        response,
        `Video generation failed with status ${response.status}`,
      )
      return { success: false, error: message }
    }

    const data: GenerateVideoResponse = await response.json()
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

// ─── Prompt Enhancement ──────────────────────────────────────────

export async function enhancePromptAPI(
  params: EnhancePromptRequest,
): Promise<EnhancePromptResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.ENHANCE_PROMPT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      const message = await getErrorMessage(
        response,
        `Enhancement failed with status ${response.status}`,
      )
      return { success: false, error: message }
    }

    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

// ─── Image Reverse Engineering ───────────────────────────────────

export async function analyzeImageAPI(
  params: AnalyzeImageRequest,
): Promise<AnalyzeImageResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.ANALYZE_IMAGE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      const message = await getErrorMessage(
        response,
        `Analysis failed with status ${response.status}`,
      )
      return { success: false, error: message }
    }

    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

export async function generateVariationsAPI(
  analysisId: string,
  params: GenerateVariationsRequest,
): Promise<GenerateVariationsResponse> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.ANALYZE_IMAGE}/${analysisId}/variations`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      },
    )

    if (!response.ok) {
      const message = await getErrorMessage(
        response,
        `Variation generation failed with status ${response.status}`,
      )
      return { success: false, error: message }
    }

    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

// ─── Arena ───────────────────────────────────────────────────────

export async function createArenaMatchAPI(
  params: CreateArenaMatchRequest,
): Promise<CreateArenaMatchResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.ARENA_MATCHES, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, `Match creation failed`),
      }
    }
    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

export async function getArenaMatchAPI(
  matchId: string,
): Promise<ArenaMatchResponse> {
  try {
    const response = await fetch(`${API_ENDPOINTS.ARENA_MATCHES}/${matchId}`)
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, `Failed to fetch match`),
      }
    }
    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

export async function submitArenaVoteAPI(
  matchId: string,
  params: ArenaVoteRequest,
): Promise<ArenaVoteResponse> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.ARENA_MATCHES}/${matchId}/vote`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      },
    )
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, `Vote failed`),
      }
    }
    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

export async function getArenaLeaderboardAPI(): Promise<ArenaLeaderboardResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.ARENA_LEADERBOARD)
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, `Failed to fetch leaderboard`),
      }
    }
    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

// ─── Storyboard ──────────────────────────────────────────────────

export async function listStoriesAPI(): Promise<StoryListResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.STORIES)
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, 'Failed to fetch stories'),
      }
    }
    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

export async function createStoryAPI(
  params: CreateStoryRequest,
): Promise<CreateStoryResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.STORIES, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, 'Failed to create story'),
      }
    }
    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

export async function getStoryAPI(id: string): Promise<StoryResponse> {
  try {
    const response = await fetch(`${API_ENDPOINTS.STORIES}/${id}`)
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, 'Failed to fetch story'),
      }
    }
    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

export async function updateStoryAPI(
  id: string,
  params: UpdateStoryRequest,
): Promise<StoryResponse> {
  try {
    const response = await fetch(`${API_ENDPOINTS.STORIES}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, 'Failed to update story'),
      }
    }
    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

export async function deleteStoryAPI(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_ENDPOINTS.STORIES}/${id}`, {
      method: 'DELETE',
    })
    if (response.status === 204) return { success: true }
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, 'Failed to delete story'),
      }
    }
    return { success: true }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

export async function generateNarrativeAPI(
  storyId: string,
  params: GenerateNarrativeRequest,
): Promise<GenerateNarrativeResponse> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.STORIES}/${storyId}/narrative`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      },
    )
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, 'Failed to generate narrative'),
      }
    }
    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

export async function reorderPanelsAPI(
  storyId: string,
  panelIds: string[],
): Promise<StoryResponse> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.STORIES}/${storyId}/reorder`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ panelIds }),
      },
    )
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, 'Failed to reorder panels'),
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
 * Fetch public gallery images with pagination, search, and filter
 */
export async function fetchGalleryImages(
  page: number = PAGINATION.DEFAULT_PAGE,
  limit: number = PAGINATION.DEFAULT_LIMIT,
  filters?: { search?: string; model?: string; sort?: string },
): Promise<GalleryResponse> {
  try {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    })
    if (filters?.search) params.set('search', filters.search)
    if (filters?.model) params.set('model', filters.model)
    if (filters?.sort) params.set('sort', filters.sort)

    const response = await fetch(`${API_ENDPOINTS.IMAGES}?${params.toString()}`)
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
