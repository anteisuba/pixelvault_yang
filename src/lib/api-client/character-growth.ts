import { API_ENDPOINTS } from '@/constants/config'
import { getErrorPayload } from '@/lib/api-client/shared'
import type {
  CharacterGrowth,
  CharacterJournalEntry,
  CharacterMemoryList,
  CharacterOutingRun,
  CharacterRecentActivity,
  StartCharacterOutingRequest,
  UpdateCharacterJournalRequest,
} from '@/types/character-growth'
import type { AssistantMemory } from '@/types/assistant-memory'
import { apiFetch } from '@/lib/api-client/api-fetch'

/**
 * **她的成长**的客户端封装（C 第 3 步；角色页右栏「最近」）：读日记、她改了什么、见闻、观点与
 * 出门状态；撤回一条、出门 / 结束、删一条见闻。观点的改删走记忆那两个接口。
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
    const response = await apiFetch(
      `${API_ENDPOINTS.CHARACTER_CARDS}/${encodeURIComponent(cardId)}/growth`,
      { method: 'GET', headers: { Accept: 'application/json' } },
    )
    return await parseJsonResult(response, 'Failed to load her growth')
  } catch (error) {
    return toFailure(error, 'Failed to load her growth')
  }
}

/** 角色总览「最近」：每位最近一件事，最多三位。 */
export async function getCharacterRecentActivityAPI(): Promise<
  ApiResult<CharacterRecentActivity[]>
> {
  try {
    const response = await apiFetch(API_ENDPOINTS.CHARACTER_CARDS_RECENT, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    return await parseJsonResult(response, 'Failed to load recent activity')
  } catch (error) {
    return toFailure(error, 'Failed to load recent activity')
  }
}

export async function revertCharacterRevisionAPI(
  revisionId: string,
): Promise<ApiResult<{ reverted: true }>> {
  try {
    const response = await apiFetch(
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

/** 出门调查「开始」（第 ⑤ 步）：马上回这一趟，她在后台逛。 */
export async function startCharacterOutingAPI(
  cardId: string,
  input: StartCharacterOutingRequest,
): Promise<ApiResult<CharacterOutingRun>> {
  try {
    const response = await apiFetch(
      `${API_ENDPOINTS.CHARACTER_CARDS}/${encodeURIComponent(cardId)}/outing`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
    )
    return await parseJsonResult(response, 'Failed to go out')
  } catch (error) {
    return toFailure(error, 'Failed to go out')
  }
}

/** 「结束」：看到的照样留着。 */
export async function stopCharacterOutingAPI(
  cardId: string,
): Promise<ApiResult<CharacterOutingRun>> {
  try {
    const response = await apiFetch(
      `${API_ENDPOINTS.CHARACTER_CARDS}/${encodeURIComponent(cardId)}/outing/stop`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
    )
    return await parseJsonResult(response, 'Failed to stop')
  } catch (error) {
    return toFailure(error, 'Failed to stop')
  }
}

/** 改她的一篇日记（第 ③ 步）。 */
export async function updateCharacterJournalAPI(
  journalId: string,
  input: UpdateCharacterJournalRequest,
): Promise<ApiResult<CharacterJournalEntry>> {
  try {
    const response = await apiFetch(
      `${API_ENDPOINTS.CHARACTER_JOURNALS}/${encodeURIComponent(journalId)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
    )
    return await parseJsonResult(response, 'Failed to save')
  } catch (error) {
    return toFailure(error, 'Failed to save')
  }
}

/** 删她的一篇日记（第 ③ 步）。 */
export async function deleteCharacterJournalAPI(
  journalId: string,
): Promise<ApiResult<unknown>> {
  try {
    const response = await apiFetch(
      `${API_ENDPOINTS.CHARACTER_JOURNALS}/${encodeURIComponent(journalId)}`,
      { method: 'DELETE' },
    )
    if (!response.ok) return await parseJsonResult(response, 'Failed to delete')
    return { success: true, data: null }
  } catch (error) {
    return toFailure(error, 'Failed to delete')
  }
}

export async function deleteCharacterFindingAPI(
  findingId: string,
): Promise<ApiResult<unknown>> {
  try {
    const response = await apiFetch(
      `${API_ENDPOINTS.CHARACTER_FINDINGS}/${encodeURIComponent(findingId)}`,
      { method: 'DELETE' },
    )
    if (!response.ok) return await parseJsonResult(response, 'Failed to delete')
    return { success: true, data: null }
  } catch (error) {
    return toFailure(error, 'Failed to delete')
  }
}

const memoriesUrl = (cardId: string) =>
  `${API_ENDPOINTS.CHARACTER_CARDS}/${encodeURIComponent(cardId)}/memories`

/** 她页「记忆」栏（第 ⑦ 步）：记得的 · 沉睡的 · 见闻。改 / 钉住 / 唤醒 / 删走记忆那两个接口。 */
export async function getCharacterMemoriesAPI(
  cardId: string,
): Promise<ApiResult<CharacterMemoryList>> {
  try {
    const response = await apiFetch(memoriesUrl(cardId), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    return await parseJsonResult(response, 'Failed to load her memories')
  } catch (error) {
    return toFailure(error, 'Failed to load her memories')
  }
}

/** 「记一条」。 */
export async function createCharacterMemoryAPI(
  cardId: string,
  text: string,
): Promise<ApiResult<AssistantMemory>> {
  try {
    const response = await apiFetch(memoriesUrl(cardId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    return await parseJsonResult(response, 'Failed to save memory')
  } catch (error) {
    return toFailure(error, 'Failed to save memory')
  }
}
