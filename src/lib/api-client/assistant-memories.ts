import { API_ENDPOINTS } from '@/constants/config'
import { getErrorPayload } from '@/lib/api-client/shared'
import type { AssistantMemoryScopeId } from '@/constants/assistant-memory'
import type { AssistantMemory } from '@/types/assistant-memory'

/**
 * **助手记忆**的客户端封装（56a）。
 *
 * Hard Rule 3：组件不 `fetch`，所有请求走这一层。
 * 形状照抄 `api-client/context-cards.ts`（同一份 `ApiResult` 三态与错误载荷）。
 *
 * ⚠ **没有「新建」**：记忆唯一的写入口是服务端每轮结账 —— 客户端能做的只有
 * 改一行、删一行、全清空。
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
  filter: { scope?: AssistantMemoryScopeId } = {},
): Promise<ApiResult<AssistantMemory[]>> {
  try {
    const query = filter.scope ? `?scope=${filter.scope}` : ''
    const response = await fetch(
      `${API_ENDPOINTS.ASSISTANT_MEMORIES}${query}`,
      { method: 'GET', headers: { Accept: 'application/json' } },
    )
    return await parseJsonResult(response, 'Failed to load memories')
  } catch (error) {
    return toFailure(error, 'Failed to load memories')
  }
}

export async function updateAssistantMemoryAPI(
  memoryId: string,
  text: string,
): Promise<ApiResult<AssistantMemory>> {
  try {
    const response = await fetch(memoryUrl(memoryId), {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify({ text }),
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

/** ⚠ 二次确认在界面上；这里带的 `confirm` 是服务端那道闸要的那一格。 */
export async function clearAssistantMemoriesAPI(): Promise<
  ApiResult<{ cleared: number }>
> {
  try {
    const response = await fetch(`${API_ENDPOINTS.ASSISTANT_MEMORIES}/clear`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ confirm: true }),
    })
    return await parseJsonResult(response, 'Failed to clear memories')
  } catch (error) {
    return toFailure(error, 'Failed to clear memories')
  }
}
