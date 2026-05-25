import { API_ENDPOINTS } from '@/constants/config'
import type { NodeAssistantRequest } from '@/types/node-assistant'

import { getErrorPayload } from '@/lib/api-client/shared'

export type NodeAssistantStreamApiResponse =
  | {
      success: true
      stream: ReadableStream<Uint8Array>
    }
  | {
      success: false
      error: string
      errorCode?: string
      i18nKey?: string
    }

export async function streamNodeAssistantAPI(
  params: NodeAssistantRequest,
): Promise<NodeAssistantStreamApiResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.NODE_ASSISTANT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      const payload = await getErrorPayload(
        response,
        `Node assistant failed with status ${response.status}`,
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
        error: 'Node assistant returned an empty stream',
        errorCode: 'EMPTY_STREAM',
      }
    }

    return {
      success: true,
      stream: response.body,
    }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Node assistant request failed',
    }
  }
}
