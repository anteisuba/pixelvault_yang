import { API_ENDPOINTS } from '@/constants/config'
import type {
  AssistantConversationShare,
  AssistantConversationRecord,
  AssistantConversationSummary,
  AssistantSurfaceId,
  SharedAssistantConversationRecord,
  UpsertAssistantConversationRequest,
} from '@/types/assistant-conversation'

import { getErrorPayload } from '@/lib/api-client/shared'

type ApiResult<T> =
  | { success: true; data: T }
  | {
      success: false
      error: string
      errorCode?: string
      i18nKey?: string
    }

async function parseJsonResult<T>(
  response: Response,
  fallbackError: string,
): Promise<ApiResult<T>> {
  if (!response.ok) {
    const payload = await getErrorPayload(response, fallbackError)
    return {
      success: false,
      error: payload.error,
      errorCode: payload.errorCode,
      i18nKey: payload.i18nKey,
    }
  }

  const body = (await response.json()) as {
    success?: boolean
    data?: T
    error?: string
  }
  if (!body.success || body.data === undefined) {
    return {
      success: false,
      error: body.error ?? fallbackError,
    }
  }
  return { success: true, data: body.data }
}

export async function listAssistantConversationsAPI(args: {
  surface: AssistantSurfaceId
  projectId?: string
  limit?: number
}): Promise<ApiResult<AssistantConversationSummary[]>> {
  try {
    const params = new URLSearchParams({
      surface: args.surface,
      list: '1',
    })
    if (args.projectId) params.set('projectId', args.projectId)
    if (args.limit) params.set('limit', String(args.limit))

    const response = await fetch(
      `${API_ENDPOINTS.ASSISTANT_CONVERSATION}?${params.toString()}`,
      { method: 'GET', headers: { Accept: 'application/json' } },
    )
    return parseJsonResult(response, 'Failed to list conversations')
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'Failed to list conversations',
    }
  }
}

export async function getAssistantConversationAPI(args: {
  surface: AssistantSurfaceId
  projectId?: string
  id?: string
}): Promise<ApiResult<AssistantConversationRecord | null>> {
  try {
    const params = new URLSearchParams({ surface: args.surface })
    if (args.projectId) params.set('projectId', args.projectId)
    if (args.id) params.set('id', args.id)

    const response = await fetch(
      `${API_ENDPOINTS.ASSISTANT_CONVERSATION}?${params.toString()}`,
      { method: 'GET', headers: { Accept: 'application/json' } },
    )
    return parseJsonResult(response, 'Failed to load conversation')
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'Failed to load conversation',
    }
  }
}

export async function upsertAssistantConversationAPI(
  body: UpsertAssistantConversationRequest,
): Promise<ApiResult<AssistantConversationRecord>> {
  try {
    const response = await fetch(API_ENDPOINTS.ASSISTANT_CONVERSATION, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return parseJsonResult(response, 'Failed to save conversation')
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'Failed to save conversation',
    }
  }
}

export async function createAssistantConversationShareAPI(
  conversationId: string,
): Promise<ApiResult<AssistantConversationShare>> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.ASSISTANT_CONVERSATION}/share`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId }),
      },
    )
    return parseJsonResult(response, 'Failed to create assistant share')
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to create assistant share',
    }
  }
}

export async function getSharedAssistantConversationAPI(
  token: string,
): Promise<ApiResult<SharedAssistantConversationRecord>> {
  try {
    const params = new URLSearchParams({ token })
    const response = await fetch(
      `${API_ENDPOINTS.ASSISTANT_SHARE}?${params.toString()}`,
      { method: 'GET', headers: { Accept: 'application/json' } },
    )
    return parseJsonResult(response, 'Failed to load assistant share')
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to load assistant share',
    }
  }
}
