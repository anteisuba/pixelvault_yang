import { API_ENDPOINTS } from '@/constants/config'
import type {
  CreateNodeWorkflowProjectRequest,
  NodeWorkflowProjectRecord,
  UpdateNodeWorkflowProjectRequest,
} from '@/types/node-workflow'

import { getErrorMessage } from '@/lib/api-client/shared'

export interface NodeWorkflowApiResponse<TData> {
  success: boolean
  data?: TData
  error?: string
  errorCode?: string
}

function endpointWithId(id: string): string {
  return `${API_ENDPOINTS.NODE_WORKFLOW_PROJECTS}/${encodeURIComponent(id)}`
}

function unexpectedError(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred'
}

export async function listNodeWorkflowProjectsAPI(): Promise<
  NodeWorkflowApiResponse<NodeWorkflowProjectRecord[]>
> {
  try {
    const response = await fetch(API_ENDPOINTS.NODE_WORKFLOW_PROJECTS)
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
    return { success: false, error: unexpectedError(error) }
  }
}

export async function createNodeWorkflowProjectAPI(
  data: CreateNodeWorkflowProjectRequest,
): Promise<NodeWorkflowApiResponse<NodeWorkflowProjectRecord>> {
  try {
    const response = await fetch(API_ENDPOINTS.NODE_WORKFLOW_PROJECTS, {
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
    return { success: false, error: unexpectedError(error) }
  }
}

export async function updateNodeWorkflowProjectAPI(
  id: string,
  data: UpdateNodeWorkflowProjectRequest,
): Promise<NodeWorkflowApiResponse<NodeWorkflowProjectRecord>> {
  try {
    const response = await fetch(endpointWithId(id), {
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
    return { success: false, error: unexpectedError(error) }
  }
}

export async function deleteNodeWorkflowProjectAPI(
  id: string,
): Promise<NodeWorkflowApiResponse<null>> {
  try {
    const response = await fetch(endpointWithId(id), { method: 'DELETE' })
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
    return { success: false, error: unexpectedError(error) }
  }
}

export async function activateNodeWorkflowProjectAPI(
  id: string,
): Promise<NodeWorkflowApiResponse<null>> {
  try {
    const response = await fetch(`${endpointWithId(id)}/activate`, {
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
    return { success: false, error: unexpectedError(error) }
  }
}
