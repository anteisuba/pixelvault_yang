import { API_ENDPOINTS } from '@/constants/config'
import { getErrorPayload } from '@/lib/api-client/shared'
import type {
  ContextCardKindId,
  ContextCardStatusId,
} from '@/constants/context-cards'
import type {
  AddContextCardImageRequest,
  ContextCard,
  CreateContextCardRequest,
  UpdateContextCardRequest,
} from '@/types/context-cards'

/**
 * **上下文卡**的客户端封装（第三期 K1）。
 *
 * Hard Rule 3：组件不 `fetch`，所有请求走这一层。
 * 形状照抄 `api-client/assistant-persona.ts`（同一份 `ApiResult` 三态与错误载荷）。
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

function cardUrl(cardId: string, suffix = ''): string {
  return `${API_ENDPOINTS.CONTEXT_CARDS}/${encodeURIComponent(cardId)}${suffix}`
}

/**
 * ⚠ `status` 缺席 = **只要已确认的**（服务端默认）。待确认区那一次查询显式传
 * `proposed`，⛔ 别让草稿混进「我的卡」那张列表。
 */
export async function listContextCardsAPI(
  filter: {
    kind?: ContextCardKindId
    status?: ContextCardStatusId
    pinnedScope?: string
  } = {},
): Promise<ApiResult<ContextCard[]>> {
  try {
    const params = new URLSearchParams()
    if (filter.kind) params.set('kind', filter.kind)
    if (filter.status) params.set('status', filter.status)
    if (filter.pinnedScope) params.set('pinnedScope', filter.pinnedScope)
    const query = params.toString()
    const response = await fetch(
      `${API_ENDPOINTS.CONTEXT_CARDS}${query ? `?${query}` : ''}`,
      { method: 'GET', headers: { Accept: 'application/json' } },
    )
    return await parseJsonResult(response, 'Failed to load context cards')
  } catch (error) {
    return toFailure(error, 'Failed to load context cards')
  }
}

export async function createContextCardAPI(
  input: CreateContextCardRequest,
): Promise<ApiResult<ContextCard>> {
  try {
    const response = await fetch(API_ENDPOINTS.CONTEXT_CARDS, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(input),
    })
    return await parseJsonResult(response, 'Failed to save context card')
  } catch (error) {
    return toFailure(error, 'Failed to save context card')
  }
}

export async function updateContextCardAPI(
  cardId: string,
  input: UpdateContextCardRequest,
): Promise<ApiResult<ContextCard>> {
  try {
    const response = await fetch(cardUrl(cardId), {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify(input),
    })
    return await parseJsonResult(response, 'Failed to save context card')
  } catch (error) {
    return toFailure(error, 'Failed to save context card')
  }
}

export async function deleteContextCardAPI(
  cardId: string,
): Promise<ApiResult<unknown>> {
  try {
    const response = await fetch(cardUrl(cardId), { method: 'DELETE' })
    return await parseJsonResult(response, 'Failed to delete context card')
  } catch (error) {
    return toFailure(error, 'Failed to delete context card')
  }
}

/** ⚠ `imageData` 是 data URL 或 http 地址 —— 与账户头像那条路逐字同形。 */
export async function addContextCardImageAPI(
  cardId: string,
  input: AddContextCardImageRequest,
): Promise<ApiResult<ContextCard>> {
  try {
    const response = await fetch(cardUrl(cardId, '/images'), {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(input),
    })
    return await parseJsonResult(response, 'Failed to upload image')
  } catch (error) {
    return toFailure(error, 'Failed to upload image')
  }
}

/** ⚠ 按 URL 摘，⛔ 不按下标（下标在两次请求之间会变）。 */
export async function removeContextCardImageAPI(
  cardId: string,
  url: string,
): Promise<ApiResult<ContextCard>> {
  try {
    const response = await fetch(cardUrl(cardId, '/images'), {
      method: 'DELETE',
      headers: JSON_HEADERS,
      body: JSON.stringify({ url }),
    })
    return await parseJsonResult(response, 'Failed to remove image')
  } catch (error) {
    return toFailure(error, 'Failed to remove image')
  }
}
