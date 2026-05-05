import { API_ENDPOINTS } from '@/constants/config'
import type { GenerationRecord, InpaintRequest, OutpaintRequest } from '@/types'

import { getErrorPayload } from './shared'

export interface ImageEditApiResult {
  imageUrl: string
  width: number
  height: number
  generation: GenerationRecord
}

export interface ImageEditApiResponse {
  success: boolean
  data?: ImageEditApiResult
  error?: string
  errorCode?: string
  i18nKey?: string
}

async function postImageEdit(
  endpoint: string,
  params: InpaintRequest | OutpaintRequest,
): Promise<ImageEditApiResponse> {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      const payload = await getErrorPayload(
        response,
        `Image edit failed with status ${response.status}`,
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

export async function inpaintImageAPI(
  params: InpaintRequest,
): Promise<ImageEditApiResponse> {
  return await postImageEdit(API_ENDPOINTS.IMAGE_INPAINT, params)
}

export async function outpaintImageAPI(
  params: OutpaintRequest,
): Promise<ImageEditApiResponse> {
  return await postImageEdit(API_ENDPOINTS.IMAGE_OUTPAINT, params)
}
