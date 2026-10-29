import { API_ENDPOINTS } from '@/constants/config'
import { getErrorPayload } from '@/lib/api-client/shared'
import type {
  CharacterBrowseState,
  CharacterGoOutResult,
  CharacterGrowth,
  UpdateCharacterBrowseRequest,
} from '@/types/character-growth'

/**
 * **她的成长**的客户端封装（C 第 3 步；角色页右栏「最近」）：读日记、她改了什么、见闻、观点与
 * 出门设置；撤回一条、改出门开关与型号、删一条见闻。观点的改删走记忆那两个接口。
 * 形状照抄 `api-client/assistant-memories.ts`。
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
  const body = (await response.json()) as { success?: boolean; data?: T }
  if (!body.success || body.data === undefined)
    return { success: false, error: fallbackError }
  return { success: true, data: body.data }
}

const toFailure = (error: unknown, fallback: string): ApiResult<never> => ({
  success: false,
  error: error instanceof Error ? error.message : fallback,
})

export async function getCharacterGrowthAPI(
  cardId: string,
): Promise<ApiResult<CharacterGrowth>> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.CHARACTER_CARDS}/${encodeURIComponent(cardId)}/growth`,
      { method: 'GET', headers: { Accept: 'application/json' } },
    )
    return await parseJsonResult(response, 'Failed to load her growth')
  } catch (error) {
    return toFailure(error, 'Failed to load her growth')
  }
}

export async function revertCharacterRevisionAPI(
  revisionId: string,
): Promise<ApiResult<{ reverted: true }>> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.CHARACTER_CARDS}/revisions/${encodeURIComponent(revisionId)}/revert`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
    )
    return await parseJsonResult(response, 'Failed to revert')
  } catch (error) {
    return toFailure(error, 'Failed to revert')
  }
}

export async function updateCharacterBrowseAPI(
  cardId: string,
  input: UpdateCharacterBrowseRequest,
): Promise<ApiResult<CharacterBrowseState>> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.CHARACTER_CARDS}/${encodeURIComponent(cardId)}/browse`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
    )
    return await parseJsonResult(response, 'Failed to save going out')
  } catch (error) {
    return toFailure(error, 'Failed to save going out')
  }
}

/** 打开开关就出门一趟；要等她逛完才回（可能一两分钟）。 */
export async function goOutNowAPI(
  cardId: string,
): Promise<ApiResult<CharacterGoOutResult>> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.CHARACTER_CARDS}/${encodeURIComponent(cardId)}/browse/now`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
    )
    return await parseJsonResult(response, 'Failed to go out')
  } catch (error) {
    return toFailure(error, 'Failed to go out')
  }
}

export async function deleteCharacterFindingAPI(
  findingId: string,
): Promise<ApiResult<unknown>> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.CHARACTER_FINDINGS}/${encodeURIComponent(findingId)}`,
      { method: 'DELETE' },
    )
    if (!response.ok) return await parseJsonResult(response, 'Failed to delete')
    return { success: true, data: null }
  } catch (error) {
    return toFailure(error, 'Failed to delete')
  }
}
