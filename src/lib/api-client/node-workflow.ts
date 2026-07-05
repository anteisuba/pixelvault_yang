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

export interface ReferenceVideoUpload {
  url: string
  sizeBytes: number
  mimeType: string
  fileName: string
  /** Poster-frame URL, present when a client-captured thumbnail was uploaded
   *  and its R2 write succeeded (§9.2). */
  thumbnailUrl?: string
}

export interface ReferenceVideoUploadResponse {
  success: boolean
  data?: ReferenceVideoUpload
  error?: string
  errorCode?: string
}

export async function uploadReferenceVideoAPI(
  file: File,
  thumbnailBlob?: Blob | null,
): Promise<ReferenceVideoUploadResponse> {
  try {
    const formData = new FormData()
    formData.append('video', file)
    if (thumbnailBlob) {
      formData.append('thumbnail', thumbnailBlob, 'thumbnail.webp')
    }

    const response = await fetch('/api/node-workflow/upload-reference-video', {
      method: 'POST',
      body: formData,
    })
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string
        errorCode?: string
      }
      return {
        success: false,
        errorCode: payload.errorCode,
        error: payload.error ?? `Failed with status ${response.status}`,
      }
    }
    return await response.json()
  } catch (error) {
    return { success: false, error: unexpectedError(error) }
  }
}

export interface MergeVideoResult {
  url: string
  sizeBytes: number
  mimeType: string
  width?: number
  height?: number
  durationSeconds?: number
  fps?: number
  requestId: string
}

export interface MergeVideoResponse {
  success: boolean
  data?: MergeVideoResult
  error?: string
  errorCode?: string
}

export interface MergeVideoClipInput {
  url: string
  startSec?: number
  endSec?: number
  naturalDurationSec?: number
}

export async function mergeVideosAPI(params: {
  /** Legacy: play every clip in full via fal merge-videos. */
  videoUrls?: readonly string[]
  /**
   * New: per-clip trim via fal compose. Send when at least one upstream
   * clip has a startSec / endSec override. Cannot be combined with
   * videoUrls — the server enforces this.
   */
  clips?: readonly MergeVideoClipInput[]
  apiKeyId?: string
  targetFps?: number
  resolution?: string
}): Promise<MergeVideoResponse> {
  try {
    const response = await fetch('/api/node-workflow/merge-videos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string
        errorCode?: string
      }
      return {
        success: false,
        errorCode: payload.errorCode,
        error: payload.error ?? `Failed with status ${response.status}`,
      }
    }
    return await response.json()
  } catch (error) {
    return { success: false, error: unexpectedError(error) }
  }
}
