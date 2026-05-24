import { API_ENDPOINTS } from '@/constants/config'
import {
  ScriptBreakdownApiSuccessResponseSchema,
  type ScriptBreakdownRequest,
  type ScriptBreakdownResponseData,
} from '@/types/script-breakdown'

import { getErrorPayload } from '@/lib/api-client/shared'

export type ScriptBreakdownApiResponse =
  | {
      success: true
      data: ScriptBreakdownResponseData
    }
  | {
      success: false
      error: string
      errorCode?: string
      i18nKey?: string
    }

export async function createScriptBreakdownAPI(
  params: ScriptBreakdownRequest,
): Promise<ScriptBreakdownApiResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.SCRIPT_BREAKDOWN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      const payload = await getErrorPayload(
        response,
        `Script breakdown failed with status ${response.status}`,
      )
      return {
        success: false,
        error: payload.error,
        errorCode: payload.errorCode,
        i18nKey: payload.i18nKey,
      }
    }

    return ScriptBreakdownApiSuccessResponseSchema.parse(
      (await response.json()) as unknown,
    )
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Script breakdown request failed',
    }
  }
}
