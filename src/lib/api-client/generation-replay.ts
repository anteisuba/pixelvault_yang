import { API_ENDPOINTS } from '@/constants/config'
import type { ReplayPayload } from '@/types'

import { getErrorMessage } from '@/lib/api-client/shared'

interface ReplayResponse {
  success: boolean
  data?: ReplayPayload
  error?: string
  errorCode?: string
}

export async function getReplayPayloadAPI(
  generationId: string,
): Promise<ReplayResponse> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.GENERATIONS_BASE}/${encodeURIComponent(generationId)}/replay`,
    )
    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: 'Not found', errorCode: 'NOT_FOUND' }
      }
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Failed with status ${response.status}`,
        ),
      }
    }
    return (await response.json()) as ReplayResponse
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    }
  }
}
