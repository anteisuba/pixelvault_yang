import type {
  GenerateRequest,
  GenerateResponse,
  GenerateVideoRequest,
  VideoSubmitResponse,
  VideoStatusResponse,
  GalleryResponse,
  CreateApiKeyRequest,
  UpdateApiKeyRequest,
  ApiKeysResponse,
  ApiKeyResponse,
  ToggleVisibilityResponse,
  UsageSummary,
  EnhancePromptRequest,
  EnhancePromptResponse,
  PromptFeedbackRequest,
  PromptFeedbackResponse,
  GenerationFeedbackRequest,
  GenerationFeedbackResponse,
  AnalyzeImageRequest,
  AnalyzeImageResponse,
  GenerateVariationsRequest,
  GenerateVariationsResponse,
  CreateArenaMatchRequest,
  CreateArenaMatchResponse,
  ArenaEntryRecord,
  ArenaMatchResponse,
  ArenaVoteRequest,
  ArenaVoteResponse,
  ArenaLeaderboardResponse,
  ArenaHistoryResponse,
  ArenaPersonalStatsResponse,
  CreateStoryRequest,
  CreateStoryResponse,
  StoryResponse,
  StoryListResponse,
  UpdateStoryRequest,
  GenerateNarrativeRequest,
  GenerateNarrativeResponse,
  ApiKeyVerifyResponse,
  CreateProjectRequest,
  UpdateProjectRequest,
  ProjectsResponse,
  ProjectResponse,
  ProjectHistoryResponse,
  CreateCharacterCardRequest,
  UpdateCharacterCardRequest,
  RefineCharacterCardRequest,
  CharacterCardResponse,
  CharacterCardsResponse,
  CharacterCardRefineResponse,
  ConsistencyScoreResponse,
  CreatorProfilePageResponse,
  UpdateProfileRequest,
  UpdateProfileResponse,
  ToggleLikeResponse,
  ToggleFollowResponse,
  UploadProfileImageResponse,
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

// ─── Video Generation (queue-based) ──────────────────────────────

export async function submitVideoAPI(
  params: GenerateVideoRequest,
): Promise<VideoSubmitResponse> {
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

    const data: VideoSubmitResponse = await response.json()
    return data
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

export async function checkVideoStatusAPI(
  jobId: string,
): Promise<VideoStatusResponse> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.GENERATE_VIDEO_STATUS}?jobId=${encodeURIComponent(jobId)}`,
    )

    if (!response.ok) {
      const message = await getErrorMessage(
        response,
        `Status check failed with status ${response.status}`,
      )
      return { success: false, error: message }
    }

    const data: VideoStatusResponse = await response.json()
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

export async function verifyApiKey(id: string): Promise<ApiKeyVerifyResponse> {
  try {
    const response = await fetch(`${API_ENDPOINTS.API_KEYS}/${id}/verify`, {
      method: 'POST',
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
  field: 'isPublic' | 'isPromptPublic' = 'isPublic',
): Promise<ToggleVisibilityResponse> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.GENERATIONS}/${id}/visibility`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field }),
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

// ─── Prompt Feedback ─────────────────────────────────────────────

export async function promptFeedbackAPI(
  params: PromptFeedbackRequest,
): Promise<PromptFeedbackResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.PROMPT_FEEDBACK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      const message = await getErrorMessage(
        response,
        `Feedback failed with status ${response.status}`,
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

// ─── Generation Feedback (Iterative Refinement) ─────────────────

export async function generationFeedbackAPI(
  params: GenerationFeedbackRequest,
): Promise<GenerationFeedbackResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.GENERATION_FEEDBACK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      const message = await getErrorMessage(
        response,
        `Generation feedback failed with status ${response.status}`,
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

export async function generateArenaEntryAPI(
  matchId: string,
  params: {
    modelId: string
    apiKeyId?: string
    slotIndex: number
    advancedParams?: Record<string, unknown>
  },
): Promise<{ success: boolean; data?: ArenaEntryRecord; error?: string }> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.ARENA_MATCHES}/${matchId}/entries`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      },
    )
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, `Entry generation failed`),
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

export async function getArenaHistoryAPI(
  page: number = 1,
  limit?: number,
): Promise<ArenaHistoryResponse> {
  try {
    const params = new URLSearchParams({ page: String(page) })
    if (limit) params.set('limit', String(limit))
    const response = await fetch(
      `${API_ENDPOINTS.ARENA_HISTORY}?${params.toString()}`,
    )
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, 'Failed to fetch arena history'),
      }
    }
    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

export async function getArenaPersonalStatsAPI(): Promise<ArenaPersonalStatsResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.ARENA_PERSONAL_STATS)
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          'Failed to fetch personal stats',
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

// ─── Projects ────────────────────────────────────────────────────

export async function listProjectsAPI(): Promise<ProjectsResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.PROJECTS)
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

export async function createProjectAPI(
  data: CreateProjectRequest,
): Promise<ProjectResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.PROJECTS, {
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

export async function updateProjectAPI(
  id: string,
  data: UpdateProjectRequest,
): Promise<ProjectResponse> {
  try {
    const response = await fetch(`${API_ENDPOINTS.PROJECTS}/${id}`, {
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

export async function deleteProjectAPI(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_ENDPOINTS.PROJECTS}/${id}`, {
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

export async function getProjectHistoryAPI(
  projectId: string,
  cursor?: string,
  limit?: number,
): Promise<ProjectHistoryResponse> {
  try {
    const params = new URLSearchParams()
    if (cursor) params.set('cursor', cursor)
    if (limit) params.set('limit', String(limit))
    const qs = params.toString()
    const url = `${API_ENDPOINTS.PROJECTS}/${projectId}/history${qs ? `?${qs}` : ''}`
    const response = await fetch(url)
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
 * Fetch gallery images with pagination, search, and filter.
 * Set `mine: true` to fetch the current user's own generations (including private).
 */
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
    if (filters?.type && filters.type !== 'all')
      params.set('type', filters.type)
    if (filters?.mine) params.set('mine', '1')

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

/**
 * Delete a generation permanently (DB record + R2 storage).
 */
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
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

/**
 * Batch delete generations.
 */
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
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

/**
 * Batch update visibility for generations.
 */
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
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

/**
 * Edit an image (upscale or remove background).
 */
export async function editImageAPI(
  action: 'upscale' | 'remove-background',
  imageUrl: string,
): Promise<{
  success: boolean
  data?: { imageUrl: string; width: number; height: number }
  error?: string
}> {
  try {
    const response = await fetch(API_ENDPOINTS.IMAGE_EDIT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, imageUrl }),
    })
    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

// ─── Character Cards ────────────────────────────────────────────

export async function listCharacterCardsAPI(): Promise<CharacterCardsResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.CHARACTER_CARDS)
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

export async function createCharacterCardAPI(
  data: CreateCharacterCardRequest,
): Promise<CharacterCardResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.CHARACTER_CARDS, {
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

export async function getCharacterCardAPI(
  id: string,
): Promise<CharacterCardResponse> {
  try {
    const response = await fetch(`${API_ENDPOINTS.CHARACTER_CARDS}/${id}`)
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

export async function updateCharacterCardAPI(
  id: string,
  data: UpdateCharacterCardRequest,
): Promise<CharacterCardResponse> {
  try {
    const response = await fetch(`${API_ENDPOINTS.CHARACTER_CARDS}/${id}`, {
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

export async function deleteCharacterCardAPI(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_ENDPOINTS.CHARACTER_CARDS}/${id}`, {
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

export async function refineCharacterCardAPI(
  id: string,
  params: RefineCharacterCardRequest,
): Promise<CharacterCardRefineResponse> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.CHARACTER_CARDS}/${id}/refine`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      },
    )
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, 'Refinement failed'),
      }
    }
    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

export async function scoreCharacterCardAPI(
  id: string,
  generationId: string,
): Promise<ConsistencyScoreResponse> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.CHARACTER_CARDS}/${id}/score`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationId }),
      },
    )
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, 'Scoring failed'),
      }
    }
    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

// ─── Creator Profile ────────────────────────────────────────────

export async function getCreatorProfileAPI(
  username: string,
  page: number = 1,
  limit?: number,
): Promise<CreatorProfilePageResponse> {
  try {
    const params = new URLSearchParams({ page: String(page) })
    if (limit) params.set('limit', String(limit))
    const response = await fetch(
      `${API_ENDPOINTS.USERS}/${encodeURIComponent(username)}?${params.toString()}`,
    )
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, 'Failed to fetch profile'),
      }
    }
    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

export async function getMyProfileAPI(): Promise<UpdateProfileResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.USER_PROFILE)
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, 'Failed to fetch profile'),
      }
    }
    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

export async function updateProfileAPI(
  data: UpdateProfileRequest,
): Promise<UpdateProfileResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.USER_PROFILE, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, 'Failed to update profile'),
      }
    }
    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

export async function syncAvatarAPI(): Promise<{
  success: boolean
  data?: { avatarUrl: string | null }
  error?: string
}> {
  try {
    const response = await fetch(API_ENDPOINTS.AVATAR_SYNC, { method: 'POST' })
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, 'Failed to sync avatar'),
      }
    }
    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

export async function uploadAvatarAPI(
  imageData: string,
): Promise<UploadProfileImageResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.UPLOAD_AVATAR, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageData }),
    })
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, 'Failed to upload avatar'),
      }
    }
    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

export async function uploadBannerAPI(
  imageData: string,
): Promise<UploadProfileImageResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.UPLOAD_BANNER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageData }),
    })
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, 'Failed to upload banner'),
      }
    }
    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

// ─── Likes ──────────────────────────────────────────────────────

export async function toggleLikeAPI(
  generationId: string,
): Promise<ToggleLikeResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.LIKES, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generationId }),
    })
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, 'Failed to toggle like'),
      }
    }
    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

// ─── Follows ────────────────────────────────────────────────────

export async function toggleFollowAPI(
  targetUserId: string,
): Promise<ToggleFollowResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.FOLLOWS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId }),
    })
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, 'Failed to toggle follow'),
      }
    }
    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}
