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

import { getErrorPayload } from '@/lib/api-client/shared'
import { getThrownErrorFields } from '@/lib/api-client/error-fields'
import { apiFetch } from '@/lib/api-client/api-fetch'

export async function listProjectsAPI(): Promise<ProjectsResponse> {
  try {
    const response = await apiFetch(API_ENDPOINTS.PROJECTS)
    if (!response.ok) {
      return {
        success: false,
        ...(await getErrorPayload(response)),
      }
    }
    return await response.json()
  } catch (error) {
    return { success: false, ...getThrownErrorFields(error) }
  }
}

export async function createProjectAPI(
  data: CreateProjectRequest,
): Promise<ProjectResponse> {
  try {
    const response = await apiFetch(API_ENDPOINTS.PROJECTS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(CLIENT_API.ACTION_TIMEOUT_MS),
    })
    if (!response.ok) {
      return {
        success: false,
        ...(await getErrorPayload(response)),
      }
    }
    return await response.json()
  } catch (error) {
    return { success: false, ...getThrownErrorFields(error) }
  }
}

export async function updateProjectAPI(
  id: string,
  data: UpdateProjectRequest,
): Promise<ProjectResponse> {
  try {
    const response = await apiFetch(`${API_ENDPOINTS.PROJECTS}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(CLIENT_API.ACTION_TIMEOUT_MS),
    })
    if (!response.ok) {
      return {
        success: false,
        ...(await getErrorPayload(response)),
      }
    }
    return await response.json()
  } catch (error) {
    return { success: false, ...getThrownErrorFields(error) }
  }
}

export async function deleteProjectAPI(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await apiFetch(`${API_ENDPOINTS.PROJECTS}/${id}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(CLIENT_API.ACTION_TIMEOUT_MS),
    })
    if (response.status === 204) return { success: true }
    if (!response.ok) {
      return {
        success: false,
        ...(await getErrorPayload(response)),
      }
    }
    return { success: true }
  } catch (error) {
    return { success: false, ...getThrownErrorFields(error) }
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
    const response = await apiFetch(url)
    if (!response.ok) {
      return {
        success: false,
        ...(await getErrorPayload(response)),
      }
    }
    return await response.json()
  } catch (error) {
    return { success: false, ...getThrownErrorFields(error) }
  }
}

/** 拖动排序之后整组写回（同一层或置顶组）。 */
export async function reorderProjectsAPI(
  data: ReorderProjectsRequest,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await apiFetch(`${API_ENDPOINTS.PROJECTS}/order`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(CLIENT_API.ACTION_TIMEOUT_MS),
    })
    if (!response.ok) {
      return {
        success: false,
        ...(await getErrorPayload(response)),
      }
    }
    return { success: true }
  } catch (error) {
    return { success: false, ...getThrownErrorFields(error) }
  }
}

/** 放进 / 拿出（一张图可以同时在好几个夹里）。返回真的放进 / 拿出的那几张。 */
export async function updateFolderItemsAPI(
  folderId: string,
  data: UpdateFolderItemsRequest,
): Promise<{ success: boolean; data?: FolderItemsResult; error?: string }> {
  try {
    const response = await apiFetch(
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
        ...(await getErrorPayload(response)),
      }
    }
    return await response.json()
  } catch (error) {
    return { success: false, ...getThrownErrorFields(error) }
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
    const response = await apiFetch(`${API_ENDPOINTS.PROJECTS}/memberships`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generationIds }),
      signal: AbortSignal.timeout(CLIENT_API.ACTION_TIMEOUT_MS),
    })
    if (!response.ok) {
      return {
        success: false,
        ...(await getErrorPayload(response)),
      }
    }
    return await response.json()
  } catch (error) {
    return { success: false, ...getThrownErrorFields(error) }
  }
}
