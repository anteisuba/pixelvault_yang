import { API_ENDPOINTS } from '@/constants/config'
import { getErrorPayload } from '@/lib/api-client/shared'
import type {
  AssistantMemoryScopeId,
  AssistantMemorySourceId,
} from '@/constants/assistant-memory'
import type {
  AssistantMemory,
  CreateAssistantMemoryRequest,
  UpdateAssistantMemoryRequest,
} from '@/types/assistant-memory'

/**
 * **助手记忆**的客户端封装（56a · 助手设置 B）。
 *
 * Hard Rule 3：组件不 `fetch`，所有请求走这一层。
 * 形状照抄 `api-client/context-cards.ts`（同一份 `ApiResult` 三态与错误载荷）。
 *
 * ⚠ 「新建」只写**你写的**：助手记的唯一写入口仍是服务端每轮结账。
 */

type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; errorCode?: string; i18nKey?: string }

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
    return { success: false, error: body.error ?? fallbackError }
  }
  return { success: true, data: body.data }
}

function toFailure(error: unknown, fallback: string): ApiResult<never> {
  return {
    success: false,
    error: error instanceof Error ? error.message : fallback,
  }
}

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const

function memoryUrl(memoryId: string): string {
  return `${API_ENDPOINTS.ASSISTANT_MEMORIES}/${encodeURIComponent(memoryId)}`
}

/** ⚠ `scope` 缺席 = 全部（chip 默认那一档）。 */
export async function listAssistantMemoriesAPI(
  filter: { scope?: AssistantMemoryScopeId; workspaceKey?: string } = {},
): Promise<ApiResult<AssistantMemory[]>> {
  try {
    const params = new URLSearchParams()
    if (filter.scope) params.set('scope', filter.scope)
    if (filter.workspaceKey) params.set('workspaceKey', filter.workspaceKey)
    const query = params.size ? `?${params}` : ''
    const response = await fetch(
      `${API_ENDPOINTS.ASSISTANT_MEMORIES}${query}`,
      { method: 'GET', headers: { Accept: 'application/json' } },
    )
    return await parseJsonResult(response, 'Failed to load memories')
  } catch (error) {
    return toFailure(error, 'Failed to load memories')
  }
}

/** 你写一条（记忆页那一格，回车存下）。需指定工作台或显式全局范围。 */
export async function createAssistantMemoryAPI(
  input: CreateAssistantMemoryRequest,
): Promise<ApiResult<AssistantMemory>> {
  try {
    const response = await fetch(API_ENDPOINTS.ASSISTANT_MEMORIES, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(input),
    })
    return await parseJsonResult(response, 'Failed to save memory')
  } catch (error) {
    return toFailure(error, 'Failed to save memory')
  }
}

export async function updateAssistantMemoryAPI(
  memoryId: string,
  input: UpdateAssistantMemoryRequest,
): Promise<ApiResult<AssistantMemory>> {
  try {
    const response = await fetch(memoryUrl(memoryId), {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify(input),
    })
    return await parseJsonResult(response, 'Failed to save memory')
  } catch (error) {
    return toFailure(error, 'Failed to save memory')
  }
}

export async function deleteAssistantMemoryAPI(
  memoryId: string,
): Promise<ApiResult<unknown>> {
  try {
    const response = await fetch(memoryUrl(memoryId), { method: 'DELETE' })
    return await parseJsonResult(response, 'Failed to delete memory')
  } catch (error) {
    return toFailure(error, 'Failed to delete memory')
  }
}

/**
 * 清空（跟着筛选走：缺 `source` = 全部）。⚠ 二次确认在界面上；这里带的 `confirm`
 * 是服务端那道闸要的那一格。
 */
export async function clearAssistantMemoriesAPI(
  source?: AssistantMemorySourceId,
): Promise<ApiResult<{ cleared: number }>> {
  try {
    const response = await fetch(`${API_ENDPOINTS.ASSISTANT_MEMORIES}/clear`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(
        source ? { confirm: true, source } : { confirm: true },
      ),
    })
    return await parseJsonResult(response, 'Failed to clear memories')
  } catch (error) {
    return toFailure(error, 'Failed to clear memories')
  }
}
