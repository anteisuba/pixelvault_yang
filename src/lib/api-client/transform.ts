import { API_ENDPOINTS } from '@/constants/config'
import type { TransformInput, TransformOutput } from '@/types/transform'

import { getErrorPayload } from './shared'

export interface TransformResponse {
  success: boolean
  data?: TransformOutput
  error?: string
  errorCode?: string
  i18nKey?: string
}

export async function transformImageAPI(
  params: TransformInput,
): Promise<TransformResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.IMAGE_TRANSFORM, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      const payload = await getErrorPayload(
        response,
        `Transform failed with status ${response.status}`,
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
