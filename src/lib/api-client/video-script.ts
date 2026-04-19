import { API_ENDPOINTS } from '@/constants/config'
import type {
  CreateVideoScriptInput,
  UpdateVideoScriptInput,
  VideoScriptRecord,
} from '@/types/video-script'

import { getErrorMessage } from '@/lib/api-client/shared'

export interface VideoScriptResponse {
  success: boolean
  data?: VideoScriptRecord
  error?: string
}

export interface VideoScriptListResponse {
  success: boolean
  data?: {
    scripts: VideoScriptRecord[]
    page: number
    size: number
    total: number
  }
  error?: string
}

export interface VideoScriptDeleteResponse {
  success: boolean
  error?: string
}

async function wrap<T>(fn: () => Promise<Response>): Promise<{
  success: boolean
  data?: T
  error?: string
}> {
  try {
    const response = await fn()
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

export async function createVideoScriptAPI(
  input: CreateVideoScriptInput,
): Promise<VideoScriptResponse> {
  return wrap<VideoScriptRecord>(() =>
    fetch(API_ENDPOINTS.VIDEO_SCRIPT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  )
}

export async function listVideoScriptsAPI(params?: {
  page?: number
  size?: number
}): Promise<VideoScriptListResponse> {
  const url = new URL(API_ENDPOINTS.VIDEO_SCRIPT, window.location.origin)
  if (params?.page) url.searchParams.set('page', String(params.page))
  if (params?.size) url.searchParams.set('size', String(params.size))
  return wrap(() => fetch(url.toString()))
}

export async function getVideoScriptAPI(
  id: string,
): Promise<VideoScriptResponse> {
  return wrap<VideoScriptRecord>(() =>
    fetch(`${API_ENDPOINTS.VIDEO_SCRIPT}/${id}`),
  )
}

export async function updateVideoScriptAPI(
  id: string,
  input: UpdateVideoScriptInput,
): Promise<VideoScriptResponse> {
  return wrap<VideoScriptRecord>(() =>
    fetch(`${API_ENDPOINTS.VIDEO_SCRIPT}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  )
}

export async function deleteVideoScriptAPI(
  id: string,
): Promise<VideoScriptDeleteResponse> {
  return wrap<null>(() =>
    fetch(`${API_ENDPOINTS.VIDEO_SCRIPT}/${id}`, { method: 'DELETE' }),
  )
}
