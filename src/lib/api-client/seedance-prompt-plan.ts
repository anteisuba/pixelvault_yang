import { API_ENDPOINTS } from '@/constants/config'
import {
  SeedancePromptPlanApiSuccessResponseSchema,
  type SeedancePromptPlanRequest,
  type SeedancePromptPlanResponseData,
} from '@/types/seedance-prompt-plan'

import { getErrorPayload } from '@/lib/api-client/shared'

export type SeedancePromptPlanApiResponse =
  | {
      success: true
      data: SeedancePromptPlanResponseData
    }
  | {
      success: false
      error: string
      errorCode?: string
      i18nKey?: string
    }

export async function createSeedancePromptPlanAPI(
  params: SeedancePromptPlanRequest,
): Promise<SeedancePromptPlanApiResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.SEEDANCE_PROMPT_PLAN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      const payload = await getErrorPayload(
        response,
        `Seedance prompt plan failed with status ${response.status}`,
      )
      return {
        success: false,
        error: payload.error,
        errorCode: payload.errorCode,
        i18nKey: payload.i18nKey,
      }
    }

    return SeedancePromptPlanApiSuccessResponseSchema.parse(
      (await response.json()) as unknown,
    )
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Seedance prompt plan request failed',
    }
  }
}
