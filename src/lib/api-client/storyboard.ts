import type {
  CreateStoryRequest,
  CreateStoryResponse,
  GenerateNarrativeRequest,
  GenerateNarrativeResponse,
  StoryListResponse,
  StoryResponse,
  UpdateStoryRequest,
} from '@/types'
import { API_ENDPOINTS } from '@/constants/config'

import { getErrorMessage } from '@/lib/api-client/shared'

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
