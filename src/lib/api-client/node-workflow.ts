import { API_ENDPOINTS } from '@/constants/config'
import type {
  CreateNodeWorkflowProjectRequest,
  NodeWorkflowProjectRecord,
  NodeWorkflowV3BackupResult,
  UpdateNodeWorkflowProjectRequest,
} from '@/types/node-workflow'

import { getErrorMessage } from '@/lib/api-client/shared'

export interface NodeWorkflowApiResponse<TData> {
  success: boolean
  data?: TData
  error?: string
  errorCode?: string
  /**
   * HTTP 状态码 —— **只在服务端真的回了一个响应时才有值**（台账 V，2026-08-29）。
   *
   * 有它 = 服务端收到了请求并拒绝（4xx 多半是 payload 本身不合法，`error` 里就是
   * Zod 的原文）；没有它 = `fetch` 自己抛了，请求根本没到（离线 / DNS / CORS）。
   *
   * 画布的持久化失败提示靠这一个字段分岔：此前两种情况共用「连不上云端，请检查
   * 网络连接」，于是一条 160 字上限的校验失败会把用户送去查网络，而画布**从那一
   * 刻起就不再落库**、刷新即失。
   */
  status?: number
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
        status: response.status,
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
        status: response.status,
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
        status: response.status,
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
        status: response.status,
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
        status: response.status,
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

/**
 * v3→v4 惰性升级前的 R2 备份（node-canvas-v2 §9.2 · 「画-3」）。
 * ⚠ 调用方**成功才允许写 v4**：失败时不升级、不写、把错误交给用户看得见的地方。
 */
export async function backupNodeWorkflowV3StateAPI(
  projectId: string,
  reason?: string,
): Promise<NodeWorkflowApiResponse<NodeWorkflowV3BackupResult>> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.STUDIO_NODE_WORKFLOW}/${encodeURIComponent(projectId)}/backup`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reason ? { reason } : {}),
      },
    )
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, 'Backup failed'),
        status: response.status,
      }
    }
    const payload = (await response
      .json()
      .catch(
        () => null,
      )) as NodeWorkflowApiResponse<NodeWorkflowV3BackupResult> | null
    if (!payload?.success || !payload.data) {
      return {
        success: false,
        error: payload?.error ?? 'Backup failed',
        status: response.status,
      }
    }
    return { ...payload, status: response.status }
  } catch (error) {
    return { success: false, error: unexpectedError(error) }
  }
}
