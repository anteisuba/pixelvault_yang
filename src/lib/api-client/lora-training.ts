import type {
  LoraTrainingSubmitErrorCode,
  SubmitLoraTrainingRequest,
  LoraTrainingResponse,
  LoraTrainingListResponse,
} from '@/types'
import { API_ENDPOINTS } from '@/constants/config'

import { getErrorMessage } from '@/lib/api-client/shared'

/**
 * Submit-failure shape the hook reads. The route returns this body for
 * LoraTrainingError throws — `code` lets the hook switch on the failure
 * mode, `fieldKey` lets the form highlight the offending input, and
 * `messageKey` is the i18n key under `LoraTraining.*` for `t(...)`.
 *
 * Gracefully degrades: if the server returns an unknown shape we still
 * populate `error` with whatever message we can read, leaving `code` /
 * `fieldKey` / `messageKey` undefined — the hook then falls back to a
 * generic toast.
 */
export interface LoraTrainingSubmitFailure {
  success: false
  error: string
  code?: LoraTrainingSubmitErrorCode
  fieldKey?: string
  messageKey?: string
}

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
): Promise<LoraTrainingResponse | LoraTrainingSubmitFailure> {
  try {
    const response = await fetch(API_ENDPOINTS.LORA_TRAINING, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      // Try to read the structured body first — LoraTrainingError returns
      // `{success, error, code, fieldKey, messageKey, ...}`. If the body
      // isn't JSON (e.g. an upstream gateway error), fall back to the
      // generic string extractor so the user still sees something useful.
      const text = await response.text()
      try {
        const parsed = JSON.parse(text) as Partial<LoraTrainingSubmitFailure>
        return {
          success: false,
          error: parsed.error ?? `Failed with status ${response.status}`,
          code: parsed.code,
          fieldKey: parsed.fieldKey,
          messageKey: parsed.messageKey,
        }
      } catch {
        return {
          success: false,
          error: text || `Failed with status ${response.status}`,
        }
      }
    }
    return (await response.json()) as LoraTrainingResponse
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
