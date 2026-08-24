import { API_ENDPOINTS } from '@/constants/config'
import type { NodeAssistantRequest } from '@/types/node-assistant'

import {
  readAssistantStream,
  type AssistantStreamMessage,
} from '@/lib/assistant-stream-client'
import { getErrorPayload } from '@/lib/api-client/shared'

export type NodeAssistantStreamApiResponse =
  | {
      success: true
      /**
       * 已解析的帧流。⚠ **这条路由 2026-08-25 起发的是 SSE 不是纯文本** ——
       * 当时 TS 一个错都没报（两边都是 `ReadableStream<Uint8Array>`），漏改这里
       * 的表现会是用户眼睁睁看着 `event: text` / `data: {...}` 被念出来。
       */
      events: AsyncIterable<AssistantStreamMessage>
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

    return { success: true, events: readAssistantStream(response.body) }
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
