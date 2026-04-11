import type {
  SubmitLoraTrainingRequest,
  LoraTrainingResponse,
  LoraTrainingListResponse,
} from '@/types'
import { API_ENDPOINTS } from '@/constants/config'

import { getErrorMessage } from '@/lib/api-client/shared'

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
