import { API_ENDPOINTS } from '@/constants/config'
import { parseApiResult, toApiFailure } from '@/lib/api-client/shared'
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

export async function getCharacterGrowthAPI(
  cardId: string,
): Promise<ApiResult<CharacterGrowth>> {
  try {
    const response = await apiFetch(
      `${API_ENDPOINTS.CHARACTER_CARDS}/${encodeURIComponent(cardId)}/growth`,
      { method: 'GET', headers: { Accept: 'application/json' } },
    )
    return await parseApiResult(response)
  } catch (error) {
    return toApiFailure(error)
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
    return await parseApiResult(response)
  } catch (error) {
    return toApiFailure(error)
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
    return await parseApiResult(response)
  } catch (error) {
    return toApiFailure(error)
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
    return await parseApiResult(response)
  } catch (error) {
    return toApiFailure(error)
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
    return await parseApiResult(response)
  } catch (error) {
    return toApiFailure(error)
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
    return await parseApiResult(response)
  } catch (error) {
    return toApiFailure(error)
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
    if (!response.ok) return await parseApiResult(response)
    return { success: true, data: null }
  } catch (error) {
    return toApiFailure(error)
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
    if (!response.ok) return await parseApiResult(response)
    return { success: true, data: null }
  } catch (error) {
    return toApiFailure(error)
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
    return await parseApiResult(response)
  } catch (error) {
    return toApiFailure(error)
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
    return await parseApiResult(response)
  } catch (error) {
    return toApiFailure(error)
  }
}
