import type {
  AnalyzeImageRequest,
  AnalyzeImageResponse,
  AudioStatusResponse,
  CivitaiTokenStatusResponse,
  EnhancePromptRequest,
  EnhancePromptResponse,
  PromptAssistantRequest,
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
  ImageDecomposeResult,
  RetryMesh3DRequest,
  ImageStatusResponse,
  StudioGenerateRequest,
  StudioGenerateResponse,
  ToggleVisibilityResponse,
  Model3DStatusResponse,
  Model3DSubmitResponse,
  UploadImageRequest,
  UploadImageResponse,
  VideoStatusResponse,
  VideoSubmitResponse,
} from '@/types'
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
 * Upload a client-rendered poster PNG (or any image) for a MODEL_3D
 * generation. Server overwrites the row's `url` / `storageKey` so the
 * asset browser can render a real thumbnail. Idempotent — calling twice
 * returns the existing row without re-uploading.
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

export async function decomposeImageAPI(
  imageUrl: string,
  options?: {
    resolution?: number
    seed?: number
    persist?: boolean
    generationId?: string
    /** HuggingFace Space override; server falls back to task default. */
    modelId?: string
  },
): Promise<{
  success: boolean
  data?: ImageDecomposeResult
  error?: string
  errorCode?: string
  i18nKey?: string
}> {
  try {
    const response = await fetch(API_ENDPOINTS.IMAGE_DECOMPOSE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrl,
        ...(options?.resolution && { resolution: options.resolution }),
        ...(options?.seed !== undefined && { seed: options.seed }),
        ...(options?.persist && {
          persist: true,
          generationId: options.generationId,
        }),
        ...(options?.modelId && { modelId: options.modelId }),
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
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Assistant failed with status ${response.status}`,
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
