import { API_ENDPOINTS } from '@/constants/config'
import type { ScriptBreakdownRequest, ScriptBreakdownResponse } from '@/types'

import { getErrorMessage } from '@/lib/api-client/shared'

export async function createScriptBreakdownAPI(
  params: ScriptBreakdownRequest,
): Promise<ScriptBreakdownResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.SCRIPT_BREAKDOWN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Script breakdown failed with status ${response.status}`,
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
