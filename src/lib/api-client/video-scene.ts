import { API_ENDPOINTS } from '@/constants/config'
import type {
  SceneAdvanceResult,
  SceneOrchestratorStatus,
} from '@/types/video-script'

import { getErrorMessage } from '@/lib/api-client/shared'

interface StartOrchestrationResult {
  started: boolean
  currentSceneIndex: number
  reason?: 'scene_active' | 'no_pending_scenes' | 'claim_lost'
}

interface ApiClientResponse<T> {
  success: boolean
  data?: T
  error?: string
}

async function wrap<T>(
  fn: () => Promise<Response>,
): Promise<ApiClientResponse<T>> {
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

export async function startOrchestrationAPI(
  scriptId: string,
): Promise<ApiClientResponse<StartOrchestrationResult>> {
  return wrap<StartOrchestrationResult>(() =>
    fetch(`${API_ENDPOINTS.VIDEO_SCRIPT}/${scriptId}/orchestrate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }),
  )
}

export async function advanceSceneAPI(
  scriptId: string,
): Promise<ApiClientResponse<SceneAdvanceResult>> {
  return wrap<SceneAdvanceResult>(() =>
    fetch(`${API_ENDPOINTS.VIDEO_SCRIPT}/${scriptId}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }),
  )
}

export async function retrySceneAPI(
  scriptId: string,
  sceneIndex: number,
): Promise<ApiClientResponse<null>> {
  return wrap<null>(() =>
    fetch(
      `${API_ENDPOINTS.VIDEO_SCRIPT}/${scriptId}/scenes/${sceneIndex}/retry`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
    ),
  )
}

export async function getSceneStatusAPI(
  scriptId: string,
): Promise<ApiClientResponse<SceneOrchestratorStatus>> {
  return wrap<SceneOrchestratorStatus>(() =>
    fetch(`${API_ENDPOINTS.VIDEO_SCRIPT}/${scriptId}/scene-status`),
  )
}
