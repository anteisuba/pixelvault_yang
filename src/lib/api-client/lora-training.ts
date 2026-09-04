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

interface LoraTrainingUploadPrepareResult {
  success: boolean
  data?: {
    uploadUrl: string
    storageKey: string
    headers: Record<string, string>
    maxBytes: number
  }
  error?: string
  errorCode?: string
}

/**
 * Upload a single training image and return its R2 URL. Three steps:
 *
 *   1. POST `/uploads`          → presigned R2 PUT (no bytes)
 *   2. PUT  presigned URL       → browser → R2, the only place bytes travel
 *   3. POST `/uploads/complete` → server verifies size + magic bytes
 *
 * Called once per file from `useLoraTraining.uploadImages` so the form keeps
 * per-image progress and a single bad file can't poison the batch. The bytes
 * no longer pass through a Next function (the old multipart route did).
 */
export async function uploadLoraTrainingImageAPI(
  file: File,
): Promise<UploadLoraTrainingImageResult> {
  try {
    const prepareResponse = await fetch(API_ENDPOINTS.LORA_TRAINING_UPLOADS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mimeType: file.type, sizeBytes: file.size }),
    })
    if (!prepareResponse.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          prepareResponse,
          `Upload prepare failed with status ${prepareResponse.status}`,
        ),
      }
    }
    const prepare =
      (await prepareResponse.json()) as LoraTrainingUploadPrepareResult
    if (!prepare.success || !prepare.data) {
      return { success: false, error: prepare.error ?? 'Upload prepare failed' }
    }

    // The one cross-origin request in this flow: browser → R2 presigned PUT.
    // A *thrown* fetch here is almost always the bucket's CORS policy, not a
    // bad file — say so instead of surfacing "Failed to fetch".
    let storageResponse: Response
    try {
      storageResponse = await fetch(prepare.data.uploadUrl, {
        method: 'PUT',
        headers: prepare.data.headers,
        body: file,
      })
    } catch (error) {
      return {
        success: false,
        error: `Could not reach image storage: ${
          error instanceof Error ? error.message : 'network error'
        }`,
      }
    }
    if (!storageResponse.ok) {
      return {
        success: false,
        error: `Image storage rejected the upload (status ${storageResponse.status})`,
      }
    }

    const completeResponse = await fetch(
      API_ENDPOINTS.LORA_TRAINING_UPLOADS_COMPLETE,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storageKey: prepare.data.storageKey,
          sizeBytes: file.size,
        }),
      },
    )
    if (!completeResponse.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          completeResponse,
          `Upload finalize failed with status ${completeResponse.status}`,
        ),
      }
    }
    return (await completeResponse.json()) as UploadLoraTrainingImageResult
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
