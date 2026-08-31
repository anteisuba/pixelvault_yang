import type {
  AnalyzeImageRequest,
  AnalyzeImageResponse,
  AudioStatusResponse,
  CivitaiTokenStatusResponse,
  EnhancePromptRequest,
  EnhancePromptResponse,
  PromptAssistantRequest,
  PromptAssistantStreamRequest,
  PromptAssistantResponse,
  GenerateRequest,
  GenerateResponse,
  GenerateAudioRequest,
  GenerateAudioResponse,
  GenerateVariationsRequest,
  GenerateVariationsResponse,
  Cancel3DRequest,
  Continue3DRequest,
  Generate3DRequest,
  GenerateVideoRequest,
  GenerationFeedbackRequest,
  GenerationRecord,
  GenerationFeedbackResponse,
  GenerationEvaluation,
  GenerationPlanRequest,
  GenerationPlanResponse,
  LongVideoRequest,
  LongVideoStatusResponse,
  LongVideoSubmitResponse,
  PromptFeedbackRequest,
  PromptFeedbackResponse,
  RetryMesh3DRequest,
  ImageStatusResponse,
  StudioGenerateRequest,
  StudioGenerateResponse,
  ToggleVisibilityResponse,
  Model3DStatusResponse,
  Model3DSubmitResponse,
  DirectUploadImagePrepare,
  DirectUploadAudioPrepare,
  DirectUploadVideoPrepare,
  UploadImageRequest,
  UploadImageResponse,
  UploadAudioResponse,
  UploadVideoResponse,
  VideoStatusResponse,
  VideoSubmitResponse,
} from '@/types'
import {
  readAssistantStream,
  type AssistantStreamMessage,
} from '@/lib/assistant-stream-client'
import { API_ENDPOINTS, CLIENT_API } from '@/constants/config'

import {
  downloadRemoteAsset,
  getErrorMessage,
  getErrorPayload,
} from '@/lib/api-client/shared'

export { downloadRemoteAsset }

export async function generateImageAPI(
  params: GenerateRequest,
): Promise<GenerateResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.GENERATE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      const payload = await getErrorPayload(
        response,
        `Image generation failed with status ${response.status}`,
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

export async function submitVideoAPI(
  params: GenerateVideoRequest,
): Promise<VideoSubmitResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.GENERATE_VIDEO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      const payload = await getErrorPayload(
        response,
        `Video generation failed with status ${response.status}`,
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

export async function checkVideoStatusAPI(
  jobId: string,
): Promise<VideoStatusResponse> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.GENERATE_VIDEO_STATUS}?jobId=${encodeURIComponent(jobId)}`,
    )

    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Status check failed with status ${response.status}`,
        ),
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

/**
 * Upload a client-rendered poster image for a VIDEO or MODEL_3D generation.
 * Videos fill their thumbnail fields; 3D keeps its poster-as-`url` model.
 * Idempotent — calling twice returns the existing row without re-uploading.
 */
export async function uploadGenerationPosterAPI(
  generationId: string,
  blob: Blob,
): Promise<{
  success: boolean
  data?: { generation: GenerationRecord }
  error?: string
}> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.GENERATION_POSTER}/${encodeURIComponent(generationId)}/poster`,
      {
        method: 'POST',
        headers: { 'Content-Type': blob.type || 'image/png' },
        body: blob,
      },
    )

    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Poster upload failed with status ${response.status}`,
        ),
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

export async function uploadImageAPI(
  params: UploadImageRequest,
): Promise<UploadImageResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.UPLOAD_IMAGE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
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

    return await response.json()
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}

interface DirectUploadPrepareResponse {
  success: boolean
  data?: DirectUploadImagePrepare
  error?: string
}

interface DirectUploadVideoPrepareResponse {
  success: boolean
  data?: DirectUploadVideoPrepare
  error?: string
}

interface DirectUploadAudioPrepareResponse {
  success: boolean
  data?: DirectUploadAudioPrepare
  error?: string
}

async function postJson<TResponse>(
  endpoint: string,
  body: Record<string, unknown>,
  fallbackMessage: string,
): Promise<TResponse | { success: false; error: string }> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    return {
      success: false,
      error: await getErrorMessage(response, fallbackMessage),
    }
  }

  return (await response.json()) as TResponse
}

/**
 * Minimal stand-in for `Response` covering only the two fields the caller
 * below actually reads. Lets the PUT step be satisfied by either a real
 * `fetch` `Response` or the XHR wrapper below without forcing a `Response`
 * shape out of `XMLHttpRequest` (which can't produce one).
 */
interface PutResult {
  ok: boolean
  status: number
}

/**
 * S4（2026-07-27，canvas-image-card.md §3 硬要求①）: XHR-based PUT so the
 * caller can get REAL upload progress — `fetch` has no upload-progress event
 * in this codebase's supported browsers. Only used when a caller passes
 * `onProgress` (see `uploadImageFileAPI` below); every other caller keeps
 * hitting the plain `fetch` path untouched, so this never changes behavior
 * for the 7 other call sites of `uploadImageFileAPI`.
 */
function putFileWithProgress(
  url: string,
  file: File,
  headers: Record<string, string>,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<PutResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url, true)
    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value)
    }
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return
      onProgress(Math.round((event.loaded / event.total) * 100))
    }
    xhr.onerror = () => reject(new Error('network error'))
    xhr.onabort = () => reject(new Error('aborted'))
    xhr.onload = () => {
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status })
    }
    if (signal) {
      if (signal.aborted) {
        xhr.abort()
        return
      }
      signal.addEventListener('abort', () => xhr.abort(), { once: true })
    }
    xhr.send(file)
  })
}

/**
 * Upload a local image file as a Generation row. Browser bytes go directly to
 * R2 through a short-lived presigned URL, then the server re-reads the R2
 * object, verifies it, creates the thumbnail, and persists the Generation row.
 * Use this for anything the user picks/drops from disk; `uploadImageAPI` is
 * for importing a remote URL.
 */
export async function uploadImageFileAPI(
  file: File,
  options?: {
    note?: string
    projectId?: string
    /** When set, the R2 PUT step runs over XHR instead of `fetch` so real
     *  byte-level progress can be reported (canvas-image-card.md §3). Omit
     *  for the plain fetch path every other caller already relies on. */
    onProgress?: (percent: number) => void
    /** Lets the caller cancel an in-flight upload (the R2 PUT step only —
     *  the tiny prepare/complete JSON round trips aren't worth cancelling).
     *  Only meaningful together with `onProgress`'s XHR path. */
    signal?: AbortSignal
  },
): Promise<UploadImageResponse> {
  try {
    const prepare = await postJson<DirectUploadPrepareResponse>(
      API_ENDPOINTS.UPLOAD_IMAGE_DIRECT,
      {
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        note: options?.note,
        projectId: options?.projectId,
      },
      'Upload prepare failed',
    )

    if (!prepare.success || !prepare.data) {
      return {
        success: false,
        error: prepare.error ?? 'Upload prepare failed',
      }
    }

    // The one cross-origin request in this flow: browser → R2 presigned PUT.
    // A *thrown* fetch here is almost always the R2 bucket's CORS policy not
    // allowing this origin (or a genuine network drop). Tag it with a stable
    // i18nKey so the UI shows a clear reason instead of the browser's opaque
    // "Failed to fetch", which points nowhere.
    let storageResponse: PutResult
    try {
      storageResponse = options?.onProgress
        ? await putFileWithProgress(
            prepare.data.uploadUrl,
            file,
            prepare.data.headers,
            options.onProgress,
            options.signal,
          )
        : await fetch(prepare.data.uploadUrl, {
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
        i18nKey: 'errors.upload.storageUnreachable',
      }
    }

    if (!storageResponse.ok) {
      return {
        success: false,
        error: `Image storage rejected the upload (status ${storageResponse.status})`,
        i18nKey: 'errors.upload.storageRejected',
      }
    }

    const complete = await postJson<UploadImageResponse>(
      API_ENDPOINTS.UPLOAD_IMAGE_DIRECT_COMPLETE,
      {
        storageKey: prepare.data.storageKey,
        mimeType: file.type,
        sizeBytes: file.size,
        note: options?.note,
        projectId: options?.projectId,
      },
      'Upload finalize failed',
    )

    return complete
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}

/** Browser-direct R2 upload for a local video selected in the asset library. */
export async function uploadVideoFileAPI(
  file: File,
  options: {
    width: number
    height: number
    duration?: number
    poster?: Blob | null
    note?: string
    projectId?: string
    onProgress?: (percent: number) => void
    signal?: AbortSignal
  },
): Promise<UploadVideoResponse> {
  try {
    const prepare = await postJson<DirectUploadVideoPrepareResponse>(
      API_ENDPOINTS.UPLOAD_VIDEO_DIRECT,
      {
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        note: options.note,
        projectId: options.projectId,
      },
      'Video upload prepare failed',
    )

    if (!prepare.success || !prepare.data) {
      return {
        success: false,
        error: prepare.error ?? 'Video upload prepare failed',
      }
    }

    let storageResponse: PutResult
    try {
      storageResponse = options.onProgress
        ? await putFileWithProgress(
            prepare.data.uploadUrl,
            file,
            prepare.data.headers,
            options.onProgress,
            options.signal,
          )
        : await fetch(prepare.data.uploadUrl, {
            method: 'PUT',
            headers: prepare.data.headers,
            body: file,
          })
    } catch (error) {
      return {
        success: false,
        error: `Could not reach video storage: ${
          error instanceof Error ? error.message : 'network error'
        }`,
        i18nKey: 'errors.upload.storageUnreachable',
      }
    }

    if (!storageResponse.ok) {
      return {
        success: false,
        error: `Video storage rejected the upload (status ${storageResponse.status})`,
        i18nKey: 'errors.upload.storageRejected',
      }
    }

    const complete = await postJson<UploadVideoResponse>(
      API_ENDPOINTS.UPLOAD_VIDEO_DIRECT_COMPLETE,
      {
        storageKey: prepare.data.storageKey,
        mimeType: file.type,
        sizeBytes: file.size,
        width: options.width,
        height: options.height,
        duration: options.duration,
        note: options.note,
        projectId: options.projectId,
      },
      'Video upload finalize failed',
    )

    if (!complete.success || !complete.data || !options.poster) {
      return complete
    }

    // Poster capture/upload is best-effort. The video is already safely in
    // the archive, and AssetTile can decode a frame itself when no poster is
    // available, so a poster failure must not turn the upload into a failure.
    const poster = await uploadGenerationPosterAPI(
      complete.data.generation.id,
      options.poster,
    )
    return poster.success && poster.data
      ? { success: true, data: poster.data }
      : complete
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}

/** Browser-direct R2 upload for local audio selected in the asset library. */
export async function uploadAudioFileAPI(
  file: File,
  options: {
    duration?: number
    note?: string
    projectId?: string
    onProgress?: (percent: number) => void
    signal?: AbortSignal
  },
): Promise<UploadAudioResponse> {
  try {
    const prepare = await postJson<DirectUploadAudioPrepareResponse>(
      API_ENDPOINTS.UPLOAD_AUDIO_DIRECT,
      {
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        note: options.note,
        projectId: options.projectId,
      },
      'Audio upload prepare failed',
    )

    if (!prepare.success || !prepare.data) {
      return {
        success: false,
        error: prepare.error ?? 'Audio upload prepare failed',
      }
    }

    let storageResponse: PutResult
    try {
      storageResponse = options.onProgress
        ? await putFileWithProgress(
            prepare.data.uploadUrl,
            file,
            prepare.data.headers,
            options.onProgress,
            options.signal,
          )
        : await fetch(prepare.data.uploadUrl, {
            method: 'PUT',
            headers: prepare.data.headers,
            body: file,
          })
    } catch (error) {
      return {
        success: false,
        error: `Could not reach audio storage: ${
          error instanceof Error ? error.message : 'network error'
        }`,
        i18nKey: 'errors.upload.storageUnreachable',
      }
    }

    if (!storageResponse.ok) {
      return {
        success: false,
        error: `Audio storage rejected the upload (status ${storageResponse.status})`,
        i18nKey: 'errors.upload.storageRejected',
      }
    }

    return await postJson<UploadAudioResponse>(
      API_ENDPOINTS.UPLOAD_AUDIO_DIRECT_COMPLETE,
      {
        storageKey: prepare.data.storageKey,
        mimeType: file.type,
        sizeBytes: file.size,
        duration: options.duration,
        note: options.note,
        projectId: options.projectId,
      },
      'Audio upload finalize failed',
    )
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}

export async function submit3DAPI(
  params: Generate3DRequest,
): Promise<Model3DSubmitResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.GENERATE_3D, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      const payload = await getErrorPayload(
        response,
        `3D generation failed with status ${response.status}`,
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

export async function check3DStatusAPI(
  jobId: string,
): Promise<Model3DStatusResponse> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.GENERATE_3D_STATUS}?jobId=${encodeURIComponent(jobId)}`,
    )

    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `3D status check failed with status ${response.status}`,
        ),
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

export async function continue3DAPI(
  params: Continue3DRequest,
): Promise<Model3DStatusResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.GENERATE_3D_CONTINUE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `3D continuation failed with status ${response.status}`,
        ),
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

export async function retryMesh3DAPI(
  params: RetryMesh3DRequest,
): Promise<Model3DStatusResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.GENERATE_3D_RETRY_MESH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `3D mesh retry failed with status ${response.status}`,
        ),
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

export async function cancel3DAPI(
  params: Cancel3DRequest,
): Promise<Model3DStatusResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.GENERATE_3D_CANCEL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `3D cancellation failed with status ${response.status}`,
        ),
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

export async function generateAudioAPI(
  params: GenerateAudioRequest,
): Promise<GenerateAudioResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.GENERATE_AUDIO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      const payload = await getErrorPayload(
        response,
        `Audio generation failed with status ${response.status}`,
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

export async function checkAudioStatusAPI(
  jobId: string,
): Promise<AudioStatusResponse> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.GENERATE_AUDIO_STATUS}?jobId=${encodeURIComponent(jobId)}`,
    )

    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Audio status check failed with status ${response.status}`,
        ),
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

export async function toggleGenerationVisibility(
  id: string,
  field: 'isPublic' | 'isPromptPublic' | 'isFeatured' = 'isPublic',
  value?: boolean,
): Promise<ToggleVisibilityResponse> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.GENERATIONS}/${id}/visibility`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, ...(value != null && { value }) }),
        signal: AbortSignal.timeout(CLIENT_API.ACTION_TIMEOUT_MS),
      },
    )
    if (!response.ok) {
      const payload = await getErrorPayload(
        response,
        `Failed with status ${response.status}`,
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

export async function setGenerationVisibility(
  id: string,
  values: Partial<
    Record<'isPublic' | 'isPromptPublic' | 'isFeatured', boolean>
  >,
): Promise<ToggleVisibilityResponse> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.GENERATIONS}/${id}/visibility`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values }),
        signal: AbortSignal.timeout(CLIENT_API.ACTION_TIMEOUT_MS),
      },
    )
    if (!response.ok) {
      const payload = await getErrorPayload(
        response,
        `Failed with status ${response.status}`,
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

export async function setAudioCoverAPI(
  id: string,
  coverImageUrl: string,
): Promise<{
  success: boolean
  data?: { id: string; previewUrl: string | null }
  error?: string
}> {
  try {
    const response = await fetch(`${API_ENDPOINTS.GENERATIONS}/${id}/cover`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coverImageUrl }),
      signal: AbortSignal.timeout(CLIENT_API.ACTION_TIMEOUT_MS),
    })
    if (!response.ok) {
      const payload = await getErrorPayload(
        response,
        `Failed with status ${response.status}`,
      )
      return { success: false, error: payload.error }
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

export async function enhancePromptAPI(
  params: EnhancePromptRequest,
): Promise<EnhancePromptResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.ENHANCE_PROMPT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Enhancement failed with status ${response.status}`,
        ),
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

export async function promptFeedbackAPI(
  params: PromptFeedbackRequest,
): Promise<PromptFeedbackResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.PROMPT_FEEDBACK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Feedback failed with status ${response.status}`,
        ),
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

export async function generationFeedbackAPI(
  params: GenerationFeedbackRequest,
): Promise<GenerationFeedbackResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.GENERATION_FEEDBACK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Generation feedback failed with status ${response.status}`,
        ),
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

export async function analyzeImageAPI(
  params: AnalyzeImageRequest,
): Promise<AnalyzeImageResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.ANALYZE_IMAGE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Analysis failed with status ${response.status}`,
        ),
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

export async function generateVariationsAPI(
  analysisId: string,
  params: GenerateVariationsRequest,
): Promise<GenerateVariationsResponse> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.ANALYZE_IMAGE}/${analysisId}/variations`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      },
    )

    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Variation generation failed with status ${response.status}`,
        ),
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

export async function editImageAPI(
  action: 'upscale' | 'remove-background',
  imageUrl: string,
  options?: {
    persist?: boolean
    generationId?: string
    /** Provider model ID — picker passes it; server falls back to task default. */
    modelId?: string
    /** Upscale-only: 2x routes to Clarity Upscaler; 4x stays on Aura SR. */
    targetScale?: '2x' | '4x'
  },
): Promise<{
  success: boolean
  data?: {
    imageUrl: string
    width: number
    height: number
    generation?: GenerationRecord
  }
  error?: string
  errorCode?: string
  i18nKey?: string
}> {
  try {
    const response = await fetch(API_ENDPOINTS.IMAGE_EDIT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Persist defaults to true server-side; only forward the field when the
      // caller wants to opt out. generationId is forwarded whenever provided
      // so the persisted row links back to the original source.
      body: JSON.stringify({
        action,
        imageUrl,
        ...(options?.persist === false && { persist: false }),
        ...(options?.generationId && { generationId: options.generationId }),
        ...(options?.modelId && { modelId: options.modelId }),
        ...(options?.targetScale && { targetScale: options.targetScale }),
      }),
    })
    if (!response.ok) {
      const payload = await getErrorPayload(
        response,
        `Failed with status ${response.status}`,
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

export async function extractElementAPI(params: {
  imageUrl: string
  prompt: string
  invert?: boolean
  sourceGenerationId?: string
  modelId?: string
  apiKeyId?: string
}): Promise<{
  success: boolean
  data?: {
    imageUrl: string
    width: number
    height: number
    generation?: GenerationRecord
  }
  error?: string
  errorCode?: string
  i18nKey?: string
}> {
  try {
    const response = await fetch(API_ENDPOINTS.IMAGE_EXTRACT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    if (!response.ok) {
      const payload = await getErrorPayload(
        response,
        `Extract failed with status ${response.status}`,
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

export async function submitLongVideoAPI(
  params: LongVideoRequest,
): Promise<LongVideoSubmitResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.GENERATE_LONG_VIDEO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      const payload = await getErrorPayload(
        response,
        `Long video generation failed with status ${response.status}`,
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

export async function checkLongVideoStatusAPI(
  pipelineId: string,
): Promise<LongVideoStatusResponse> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.GENERATE_LONG_VIDEO_STATUS}?pipelineId=${encodeURIComponent(pipelineId)}`,
    )

    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Status check failed with status ${response.status}`,
        ),
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

export async function retryLongVideoClipAPI(
  pipelineId: string,
  clipIndex: number,
): Promise<LongVideoStatusResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.GENERATE_LONG_VIDEO_RETRY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pipelineId, clipIndex }),
    })

    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Retry failed with status ${response.status}`,
        ),
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

export async function cancelLongVideoAPI(
  pipelineId: string,
): Promise<LongVideoStatusResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.GENERATE_LONG_VIDEO_CANCEL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pipelineId }),
    })

    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Cancel failed with status ${response.status}`,
        ),
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

export async function checkImageGenerationStatusAPI(
  jobId: string,
): Promise<ImageStatusResponse> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.STUDIO_GENERATE_STATUS}?jobId=${encodeURIComponent(jobId)}`,
    )

    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Status check failed with status ${response.status}`,
        ),
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

export async function studioGenerateAPI(
  data: StudioGenerateRequest,
): Promise<StudioGenerateResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.STUDIO_GENERATE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      const payload = await getErrorPayload(
        response,
        `Failed with status ${response.status}`,
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

export async function studioSelectWinnerAPI(data: {
  runGroupId: string
  generationId: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(API_ENDPOINTS.STUDIO_SELECT_WINNER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      const payload = await getErrorPayload(
        response,
        `Failed with status ${response.status}`,
      )
      return { success: false, error: payload.error }
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

export async function getCivitaiTokenStatusAPI(): Promise<CivitaiTokenStatusResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.CIVITAI_TOKEN)
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, 'Failed to get token status'),
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

export async function setCivitaiTokenAPI(
  token: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(API_ENDPOINTS.CIVITAI_TOKEN, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, 'Failed to save token'),
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

export async function deleteCivitaiTokenAPI(): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const response = await fetch(API_ENDPOINTS.CIVITAI_TOKEN, {
      method: 'DELETE',
    })
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, 'Failed to delete token'),
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

// ─── Prompt Assistant (Chat-based) ──────────────────────────────

export async function chatPromptAssistantAPI(
  params: PromptAssistantRequest,
): Promise<PromptAssistantResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.PROMPT_ASSISTANT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      const payload = await getErrorPayload(
        response,
        `Assistant failed with status ${response.status}`,
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

export type PromptAssistantStreamApiResponse =
  | {
      success: true
      /**
       * 已解析的帧流（`text` / `research` / `lora` / `error`）。
       *
       * ⚠ **回执与候选是流里的帧，不再是响应头**（2026-08-25 换帧协议）。旧方案
       * 把它们 base64 塞进 HTTP 头，因而受头字段大小上限约束，候选那份不得不带
       * 三档降级阶梯；帧没有上限，那套阶梯已随此改动删除。代价是它们**不再于
       * 函数返回时就位** —— 消费者要在迭代中接住，服务端保证它们排在第一个
       * `text` 之前。
       */
      events: AsyncIterable<AssistantStreamMessage>
    }
  | { success: false; error: string; errorCode?: string; i18nKey?: string }

/**
 * 对话轮：拿到的是帧流，不是解析好的整条回答。正文里的协议块（`[[ask]]` /
 * `[[next]]` …）**仍归客户端抽取**（`lib/assistant-protocol-blocks.ts`）——
 * 把标记也升级成帧是下一片。
 */
export async function streamPromptAssistantAPI(
  params: PromptAssistantStreamRequest,
): Promise<PromptAssistantStreamApiResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.PROMPT_ASSISTANT_STREAM, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      const payload = await getErrorPayload(
        response,
        `Assistant failed with status ${response.status}`,
      )
      return {
        success: false,
        error: payload.error,
        errorCode: payload.errorCode,
        i18nKey: payload.i18nKey,
      }
    }

    if (!response.body) {
      return {
        success: false,
        error: 'Assistant returned an empty stream',
        errorCode: 'EMPTY_STREAM',
      }
    }

    return { success: true, events: readAssistantStream(response.body) }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}

// ─── Assign Generation to Project ───────────────────────────────

export async function assignToProjectAPI(
  generationId: string,
  projectId: string | null,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.GENERATIONS}/${generationId}/project`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      },
    )

    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          'Failed to assign generation to project',
        ),
      }
    }

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'Failed to assign generation',
    }
  }
}

// ── Generation Plan (B.1.5) ─────────────────────────────────────

export async function fetchGenerationPlanAPI(
  params: GenerationPlanRequest,
): Promise<{
  success: boolean
  data?: GenerationPlanResponse
  error?: string
}> {
  try {
    const response = await fetch(API_ENDPOINTS.GENERATION_PLAN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Plan failed with status ${response.status}`,
        ),
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

export async function evaluateGenerationAPI(generationId: string): Promise<{
  success: boolean
  data?: GenerationEvaluation | null
  error?: string
}> {
  try {
    const response = await fetch(API_ENDPOINTS.GENERATION_EVALUATE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generationId }),
    })
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Evaluate failed with status ${response.status}`,
        ),
      }
    }
    const body = (await response.json()) as {
      success: boolean
      data?: { evaluation?: GenerationEvaluation | null }
    }
    return {
      success: body.success,
      data: body.data?.evaluation ?? null,
    }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}
