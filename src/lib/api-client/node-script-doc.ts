import { API_ENDPOINTS } from '@/constants/config'
import {
  NodeScriptDocApiSuccessResponseSchema,
  type NodeScriptDocRequest,
  type NodeScriptDocResponseData,
} from '@/types/script-doc'

import { getErrorPayload } from '@/lib/api-client/shared'

export type NodeScriptDocApiResponse =
  | {
      success: true
      data: NodeScriptDocResponseData
    }
  | {
      success: false
      error: string
      errorCode?: string
      i18nKey?: string
    }

export async function createNodeScriptDocAPI(
  params: NodeScriptDocRequest,
): Promise<NodeScriptDocApiResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.NODE_SCRIPT_DOC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      const payload = await getErrorPayload(
        response,
        `ScriptDoc draft failed with status ${response.status}`,
      )
      return {
        success: false,
        error: payload.error,
        errorCode: payload.errorCode,
        i18nKey: payload.i18nKey,
      }
    }

    return NodeScriptDocApiSuccessResponseSchema.parse(
      (await response.json()) as unknown,
    )
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'ScriptDoc draft request failed',
    }
  }
}
