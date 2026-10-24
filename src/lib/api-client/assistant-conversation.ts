import { API_ENDPOINTS } from '@/constants/config'
import type {
  AssistantConversationRecord,
  AssistantConversationSummary,
  SharedAssistantConversationRecord,
  AssistantConversationRoundStored,
  UpdateAssistantConversationRoundRequest,
  UpsertAssistantConversationRequest,
} from '@/types/assistant-conversation'

import type { StudioConversationActivity } from '@/types/studio-conversation-activity'
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
  operatorOnly?: boolean
  limit?: number
}): Promise<ApiResult<AssistantConversationSummary[]>> {
  try {
    const params = new URLSearchParams({ list: '1' })
    if (args.operatorOnly !== undefined)
      params.set('operatorOnly', args.operatorOnly ? '1' : '0')
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
  id?: string
  operatorOnly?: boolean
}): Promise<ApiResult<AssistantConversationRecord | null>> {
  try {
    const params = new URLSearchParams()
    if (args.id) params.set('id', args.id)
    if (args.operatorOnly !== undefined)
      params.set('operatorOnly', args.operatorOnly ? '1' : '0')

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

export async function deleteAssistantConversationAPI(
  id: string,
): Promise<ApiResult<null>> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.ASSISTANT_CONVERSATION}/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    )
    return parseJsonResult(response, 'Failed to delete conversation')
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Failed to delete conversation',
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

export async function renameAssistantConversationAPI(
  id: string,
  title: string,
): Promise<ApiResult<{ title: string }>> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.ASSISTANT_CONVERSATION}/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      },
    )
    return parseJsonResult(response, 'Failed to rename conversation')
  } catch {
    return { success: false, error: 'Failed to rename conversation' }
  }
}

/** 左边列表那几段对话的封面 / 进度 / 最近出完的时间（第 9f 步 9f-3）。 */
export async function getStudioConversationActivityAPI(
  ids: readonly string[],
): Promise<ApiResult<StudioConversationActivity[]>> {
  try {
    const params = new URLSearchParams({ ids: ids.join(',') })
    const response = await fetch(
      `${API_ENDPOINTS.STUDIO_CONVERSATION_ACTIVITY}?${params}`,
    )
    return parseJsonResult(response, 'Failed to load conversation activity')
  } catch {
    return { success: false, error: 'Failed to load conversation activity' }
  }
}

/** 记下这段对话最后开着的台（第 9f 步 9f-3）；null = 收起了台。 */
export async function setAssistantConversationBenchAPI(
  id: string,
  bench: string | null,
): Promise<ApiResult<{ bench: string | null }>> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.ASSISTANT_CONVERSATION}/${encodeURIComponent(id)}/bench`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bench }),
      },
    )
    return parseJsonResult(response, 'Failed to save conversation bench')
  } catch {
    return { success: false, error: 'Failed to save conversation bench' }
  }
}

/**
 * 结论记录的**就地编辑**回写（v2 §7.7，commit #13）。
 *
 * ⚠ 走的是**会话那条既有路由**的 PATCH：结论记录是那一行里的一列，
 * ⛔ 不为它新开端点（见 route 的头注）。
 */
export async function updateAssistantConversationRoundAPI(
  body: UpdateAssistantConversationRoundRequest,
): Promise<ApiResult<AssistantConversationRoundStored>> {
  try {
    const response = await fetch(API_ENDPOINTS.ASSISTANT_CONVERSATION, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return parseJsonResult(response, 'Failed to save round summary')
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'Failed to save round summary',
    }
  }
}
