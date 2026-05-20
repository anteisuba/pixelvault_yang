import type {
  SubmitLoraTrainingRequest,
  LoraTrainingResponse,
  LoraTrainingListResponse,
} from '@/types'
import { API_ENDPOINTS } from '@/constants/config'

import { getErrorMessage } from '@/lib/api-client/shared'

export interface UploadLoraTrainingImageResult {
  success: boolean
  data?: {
    url: string
    storageKey: string
    mimeType: string
    width: number
    height: number
    sizeBytes: number
  }
  error?: string
  errorCode?: string
}

/**
 * Upload a single training image to R2 and return its public URL. Called
 * once per file from `LoraTrainingForm.handleFileChange` instead of the
 * legacy FileReader → base64 path that would bloat the eventual submit
 * body past Next.js's size limit.
 */
export async function uploadLoraTrainingImageAPI(
  file: File,
): Promise<UploadLoraTrainingImageResult> {
  try {
    const formData = new FormData()
    formData.append('image', file)
    const response = await fetch(API_ENDPOINTS.LORA_TRAINING_UPLOADS, {
      method: 'POST',
      body: formData,
    })
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Upload failed with status ${response.status}`,
        ),
      }
    }
    return (await response.json()) as UploadLoraTrainingImageResult
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Network error during upload'
    return { success: false, error: message }
  }
}

export async function submitLoraTrainingAPI(
  data: SubmitLoraTrainingRequest,
): Promise<LoraTrainingResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.LORA_TRAINING, {
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
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

export async function listLoraTrainingJobsAPI(): Promise<LoraTrainingListResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.LORA_TRAINING)
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

export async function getLoraTrainingStatusAPI(
  jobId: string,
): Promise<LoraTrainingResponse> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.LORA_TRAINING}/${jobId}/status`,
    )
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
