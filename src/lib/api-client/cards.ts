import type {
  CharacterCardGalleryResponse,
  CharacterCardResponse,
  CharacterCardsResponse,
  ConsistencyScoreResponse,
  CreateCharacterCardRequest,
  UpdateCharacterCardRequest,
} from '@/types'
import {
  ChubFullPathSchema,
  type ChubCharacterNode,
  type ChubSearchQuery,
  type ChubSearchResult,
  type ImportChubCardRequest,
} from '@/types/chub-library'
import type { ImportTavernCardRequest } from '@/types/tavern-card'
import {
  CHUB_LIBRARY,
  CHUB_LIBRARY_ERRORS,
  type ChubLibraryErrorKind,
} from '@/constants/cards/chub-library'
import { API_ENDPOINTS } from '@/constants/config'

import { getErrorMessage, getErrorPayload } from '@/lib/api-client/shared'
import {
  chubCharacterUrl,
  chubSearchUrl,
  isChubCountryBlock,
  parseChubCharacter,
  parseChubSearch,
} from '@/lib/chub-library'

export async function listCharacterCardsAPI(): Promise<CharacterCardsResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.CHARACTER_CARDS)
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Failed with status ${response.status}`,
        ),
      }
    }
    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

export async function createCharacterCardAPI(
  data: CreateCharacterCardRequest,
): Promise<CharacterCardResponse> {
  try {
    const response = await fetch(API_ENDPOINTS.CHARACTER_CARDS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Failed with status ${response.status}`,
        ),
      }
    }
    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

/** 导入一张酒馆卡（PNG / JSON）→ 一张角色卡。失败带 `i18nKey`，调用方说人话。 */
export async function importTavernCardAPI(
  data: ImportTavernCardRequest,
): Promise<CharacterCardResponse & { i18nKey?: string }> {
  try {
    const response = await fetch(API_ENDPOINTS.CHARACTER_CARDS_IMPORT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      const payload = await getErrorPayload(
        response,
        `Failed with status ${response.status}`,
      )
      return { success: false, error: payload.error, i18nKey: payload.i18nKey }
    }
    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

interface ChubFailure {
  success: false
  error: string
  errorCode: string
  i18nKey: string
}

function chubFailure(kind: ChubLibraryErrorKind): ChubFailure {
  const error = CHUB_LIBRARY_ERRORS[kind]
  return {
    success: false,
    error: error.message,
    errorCode: error.code,
    i18nKey: error.i18nKey,
  }
}

/**
 * **浏览器直接问 chub**（api.chub.ai 拒机房 IP、对任何来源回 ACAO `*`，见
 * `CHUB_LIBRARY` 头注）。只带 CORS 安全名单里的头（`Accept`），⛔ 触发预检；超时
 * `CHUB_LIBRARY.TIMEOUT_MS`，调用方的 `signal` 一并生效。
 */
async function fetchChubJson(
  url: string,
  signal?: AbortSignal,
): Promise<
  | { ok: true; json: unknown }
  | { ok: false; kind: 'unavailable' | 'countryBlocked' | 'notFound' }
> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  const timer = setTimeout(abort, CHUB_LIBRARY.TIMEOUT_MS)
  if (signal?.aborted) abort()
  signal?.addEventListener('abort', abort)
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (response.status === 404) return { ok: false, kind: 'notFound' }
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      return {
        ok: false,
        kind: isChubCountryBlock(response.status, body)
          ? 'countryBlocked'
          : 'unavailable',
      }
    }
    return { ok: true, json: await response.json() }
  } catch {
    return { ok: false, kind: 'unavailable' }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}

/** 卡库：浏览器直接搜 chub.ai 上的酒馆卡。失败带 `i18nKey`。 */
export async function searchChubCardsAPI(
  query: ChubSearchQuery,
  signal?: AbortSignal,
): Promise<{
  success: boolean
  data?: ChubSearchResult
  error?: string
  errorCode?: string
  i18nKey?: string
}> {
  const result = await fetchChubJson(chubSearchUrl(query), signal)
  if (!result.ok) {
    return chubFailure(
      result.kind === 'countryBlocked' ? 'countryBlocked' : 'unavailable',
    )
  }
  const data = parseChubSearch(result.json, query.page, query.q)
  return data ? { success: true, data } : chubFailure('unavailable')
}

/** 卡库详情：浏览器从 chub 取一张卡的完整定义（只读，⛔ 建卡）。失败带 `i18nKey`。 */
export async function getChubCardAPI(
  fullPath: string,
  signal?: AbortSignal,
): Promise<
  | { success: true; data: ChubCharacterNode }
  | (ChubFailure & { data?: undefined })
> {
  const path = ChubFullPathSchema.safeParse(fullPath)
  if (!path.success) return chubFailure('notFound')
  const fetched = await fetchChubJson(chubCharacterUrl(path.data), signal)
  if (!fetched.ok) return chubFailure(fetched.kind)
  const card = parseChubCharacter(fetched.json)
  if (!card.success) return chubFailure(card.reason)
  return { success: true, data: card.node }
}

/**
 * 卡库里的一张卡 → 一张角色卡：浏览器从 chub 取完整定义，连同路径递给我们的服务端建卡
 * （服务端 ⛔ 再问 chub）。失败带 `i18nKey`。
 */
export async function importChubCardAPI({
  fullPath,
}: Pick<ImportChubCardRequest, 'fullPath'>): Promise<
  CharacterCardResponse & { i18nKey?: string }
> {
  const path = ChubFullPathSchema.safeParse(fullPath)
  if (!path.success) return chubFailure('notFound')
  const fetched = await fetchChubJson(chubCharacterUrl(path.data))
  if (!fetched.ok) return chubFailure(fetched.kind)
  const card = parseChubCharacter(fetched.json)
  if (!card.success) return chubFailure(card.reason)

  const body: ImportChubCardRequest = { fullPath: path.data, node: card.node }
  try {
    const response = await fetch(API_ENDPOINTS.CHARACTER_CARDS_CHUB_IMPORT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      const payload = await getErrorPayload(
        response,
        `Failed with status ${response.status}`,
      )
      return { success: false, error: payload.error, i18nKey: payload.i18nKey }
    }
    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

export async function getCharacterCardAPI(
  id: string,
): Promise<CharacterCardResponse> {
  try {
    const response = await fetch(`${API_ENDPOINTS.CHARACTER_CARDS}/${id}`)
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Failed with status ${response.status}`,
        ),
      }
    }
    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

export async function updateCharacterCardAPI(
  id: string,
  data: UpdateCharacterCardRequest,
): Promise<CharacterCardResponse> {
  try {
    const response = await fetch(`${API_ENDPOINTS.CHARACTER_CARDS}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Failed with status ${response.status}`,
        ),
      }
    }
    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

export async function deleteCharacterCardAPI(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_ENDPOINTS.CHARACTER_CARDS}/${id}`, {
      method: 'DELETE',
    })
    if (response.status === 204) return { success: true }
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(
          response,
          `Failed with status ${response.status}`,
        ),
      }
    }
    return { success: true }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

/** 试读：让助手用这个角色的口吻说两句（卡片页「设定」一行）。 */
export async function sampleCharacterLinesAPI(id: string): Promise<{
  success: boolean
  data?: { lines: string[] }
  error?: string
  /** 助手那一家跑不了（缺 key）时界面按它说清原因。 */
  errorCode?: string
  i18nKey?: string
}> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.CHARACTER_CARDS}/${id}/sample-lines`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
    )
    if (!response.ok) {
      const payload = await getErrorPayload(response, 'Sample lines failed')
      return {
        success: false,
        error: payload.error,
        errorCode: payload.errorCode,
        i18nKey: payload.i18nKey,
      }
    }
    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

export async function scoreCharacterCardAPI(
  id: string,
  generationId: string,
): Promise<ConsistencyScoreResponse> {
  try {
    const response = await fetch(
      `${API_ENDPOINTS.CHARACTER_CARDS}/${id}/score`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationId }),
      },
    )
    if (!response.ok) {
      return {
        success: false,
        error: await getErrorMessage(response, 'Scoring failed'),
      }
    }
    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

export async function getCharacterCardGenerationsAPI(
  cardId: string,
  page: number = 1,
  limit: number = 20,
  cursor?: string | null,
): Promise<CharacterCardGalleryResponse> {
  try {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    })
    if (cursor) params.set('cursor', cursor)
    const response = await fetch(
      `/api/character-cards/${cardId}/generations?${params}`,
    )
    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}

export async function getCharacterCombinationGenerationsAPI(
  cardIds: string[],
  page: number = 1,
  limit: number = 20,
  cursor?: string | null,
): Promise<CharacterCardGalleryResponse> {
  try {
    const params = new URLSearchParams({
      cardIds: cardIds.join(','),
      page: String(page),
      limit: String(limit),
    })
    if (cursor) params.set('cursor', cursor)
    const response = await fetch(`/api/character-cards/generations?${params}`)
    return await response.json()
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred'
    return { success: false, error: message }
  }
}
