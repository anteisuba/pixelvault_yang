import { API_ENDPOINTS } from '@/constants/config'
import { getErrorPayload } from '@/lib/api-client/shared'
import type { CharacterGrowth } from '@/types/character-growth'

/**
 * **她的成长**的客户端封装（C 第 3 步）：设置「她」那一页读日记与「她改了什么」、撤回一条。
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
