import type {
  CreateProjectRequest,
  FolderItemsResult,
  ProjectHistoryResponse,
  ProjectResponse,
  ProjectsResponse,
  ReorderProjectsRequest,
  UpdateFolderItemsRequest,
  UpdateProjectRequest,
} from '@/types'
import { API_ENDPOINTS, CLIENT_API } from '@/constants/config'

import { getErrorMessage } from '@/lib/api-client/shared'

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
  type?: string,
): Promise<ProjectHistoryResponse> {
  try {
    const params = new URLSearchParams()
    if (cursor) params.set('cursor', cursor)
    if (limit) params.set('limit', String(limit))
    if (type && type !== 'all') params.set('type', type)
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

/** 拖动排序之后整组写回（同一层或置顶组）。 */
export async function reorderProjectsAPI(
  data: ReorderProjectsRequest,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_ENDPOINTS.PROJECTS}/order`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
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
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

/** 放进 / 拿出（一张图可以同时在好几个夹里）。返回真的放进 / 拿出的那几张。 */
export async function updateFolderItemsAPI(
  folderId: string,
  data: UpdateFolderItemsRequest,
): Promise<{ success: boolean; data?: FolderItemsResult; error?: string }> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.PROJECTS}/${folderId}/items`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(CLIENT_API.ACTION_TIMEOUT_MS),
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

/** 这几张各自在哪些夹里（`generationId → 夹 id[]`）。 */
export async function getFolderMembershipsAPI(
  generationIds: string[],
): Promise<{
  success: boolean
  data?: Record<string, string[]>
  error?: string
}> {
  try {
    const response = await fetch(`${API_ENDPOINTS.PROJECTS}/memberships`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generationIds }),
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
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}
