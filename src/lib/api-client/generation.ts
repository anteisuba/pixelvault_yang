import type {
  AnalyzeImageRequest,
  AnalyzeImageResponse,
  AudioStatusResponse,
  CivitaiTokenStatusResponse,
  EnhancePromptRequest,
  EnhancePromptResponse,
  PromptAssistantRequest,
  PromptAssistantResponse,
  GenerateAudioRequest,
  GenerateAudioResponse,
  GenerateResponse,
  GenerateVariationsRequest,
  GenerateVariationsResponse,
  GenerateVideoRequest,
  GenerationFeedbackRequest,
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
  StudioGenerateRequest,
  ToggleVisibilityResponse,
  VideoStatusResponse,
  VideoSubmitResponse,
} from '@/types'
import { API_ENDPOINTS } from '@/constants/config'

import {
  downloadRemoteAsset,
  getErrorMessage,
  getErrorPayload,
} from '@/lib/api-client/shared'

export { downloadRemoteAsset }

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
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Video generation failed with status ${response.status}`,
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
): Promise<ToggleVisibilityResponse> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.GENERATIONS}/${id}/visibility`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field }),
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
  options?: { persist?: boolean; generationId?: string },
): Promise<{
  success: boolean
  data?: { imageUrl: string; width: number; height: number }
  error?: string
  errorCode?: string
  i18nKey?: string
}> {
  try {
    const response = await fetch(API_ENDPOINTS.IMAGE_EDIT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        imageUrl,
        ...(options?.persist && {
          persist: true,
          generationId: options.generationId,
        }),
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
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Long video generation failed with status ${response.status}`,
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

export async function studioGenerateAPI(
  data: StudioGenerateRequest,
): Promise<GenerateResponse> {
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

export async function requestGenerationPlan(
  params: GenerationPlanRequest,
): Promise<
  | { success: true; data: GenerationPlanResponse }
  | { success: false; error: string; errorCode?: string; i18nKey?: string }
> {
  try {
    const response = await fetch(API_ENDPOINTS.GENERATION_PLAN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      const payload = await getErrorPayload(
        response,
        `Generation plan failed with status ${response.status}`,
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
        error instanceof Error
          ? error.message
          : 'Failed to fetch generation plan',
    }
  }
}

export async function requestGenerationEvaluate(
  generationId: string,
): Promise<
  | { success: true; data: GenerationEvaluation }
  | { success: false; error: string; errorCode?: string; i18nKey?: string }
> {
  try {
    const response = await fetch(API_ENDPOINTS.GENERATION_EVALUATE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generationId }),
    })

    if (!response.ok) {
      const payload = await getErrorPayload(
        response,
        `Generation evaluation failed with status ${response.status}`,
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
        error instanceof Error
          ? error.message
          : 'Failed to fetch generation evaluation',
    }
  }
}
