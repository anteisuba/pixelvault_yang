import type {
  MultiViewGenerateRequest,
  MultiViewGenerateResponse,
} from '@/types'
import { API_ENDPOINTS } from '@/constants/config'

import { getErrorPayload } from '@/lib/api-client/shared'

export async function generateMultiViewAPI(
  params: MultiViewGenerateRequest,
): Promise<MultiViewGenerateResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.GENERATE_MULTIVIEW, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      const payload = await getErrorPayload(
        response,
        `Multi-view generation failed with status ${response.status}`,
      )
      return {
        success: false,
        error: payload.error,
        errorCode: payload.errorCode,
        i18nKey: payload.i18nKey,
      }
    }

    return await response.json()
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}
