import { API_ENDPOINTS } from '@/constants/config'
import { parseApiResult, toApiFailure } from '@/lib/api-client/shared'
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
import { apiFetch } from '@/lib/api-client/api-fetch'

/**
 * **上下文卡**的客户端封装（第三期 K1）。
 *
 * Hard Rule 3：组件不 `fetch`，所有请求走这一层。
 * 形状照抄 `api-client/assistant-persona.ts`（同一份 `ApiResult` 三态与错误载荷）。
 */

type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; errorCode?: string; i18nKey?: string }

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
    const response = await apiFetch(
      `${API_ENDPOINTS.CONTEXT_CARDS}${query ? `?${query}` : ''}`,
      { method: 'GET', headers: { Accept: 'application/json' } },
    )
    return await parseApiResult(response)
  } catch (error) {
    return toApiFailure(error)
  }
}

export async function createContextCardAPI(
  input: CreateContextCardRequest,
): Promise<ApiResult<ContextCard>> {
  try {
    const response = await apiFetch(API_ENDPOINTS.CONTEXT_CARDS, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(input),
    })
    return await parseApiResult(response)
  } catch (error) {
    return toApiFailure(error)
  }
}

export async function updateContextCardAPI(
  cardId: string,
  input: UpdateContextCardRequest,
): Promise<ApiResult<ContextCard>> {
  try {
    const response = await apiFetch(cardUrl(cardId), {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify(input),
    })
    return await parseApiResult(response)
  } catch (error) {
    return toApiFailure(error)
  }
}

export async function deleteContextCardAPI(
  cardId: string,
): Promise<ApiResult<unknown>> {
  try {
    const response = await apiFetch(cardUrl(cardId), { method: 'DELETE' })
    return await parseApiResult(response)
  } catch (error) {
    return toApiFailure(error)
  }
}

/** ⚠ `imageData` 是 data URL 或 http 地址 —— 与账户头像那条路逐字同形。 */
export async function addContextCardImageAPI(
  cardId: string,
  input: AddContextCardImageRequest,
): Promise<ApiResult<ContextCard>> {
  try {
    const response = await apiFetch(cardUrl(cardId, '/images'), {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(input),
    })
    return await parseApiResult(response)
  } catch (error) {
    return toApiFailure(error)
  }
}

/** ⚠ 按 URL 摘，⛔ 不按下标（下标在两次请求之间会变）。 */
export async function removeContextCardImageAPI(
  cardId: string,
  url: string,
): Promise<ApiResult<ContextCard>> {
  try {
    const response = await apiFetch(cardUrl(cardId, '/images'), {
      method: 'DELETE',
      headers: JSON_HEADERS,
      body: JSON.stringify({ url }),
    })
    return await parseApiResult(response)
  } catch (error) {
    return toApiFailure(error)
  }
}
