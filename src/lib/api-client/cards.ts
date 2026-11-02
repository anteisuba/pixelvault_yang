import type {
  CharacterCardGalleryResponse,
  CharacterCardResponse,
  CharacterCardsResponse,
  CharacterDialogueDraft,
  CharacterDialogueDraftKind,
  CharacterExampleAdd,
  CreateCharacterCardRequest,
  CreateCharacterLookRequest,
  UpdateCharacterCardRequest,
  UpdateCharacterLookRequest,
} from '@/types'
import {
  ChubFullPathSchema,
  type ChubCharacterNode,
  type ChubSearchQuery,
  type ChubSearchResult,
  type ImportChubCardRequest,
} from '@/types/chub-library'
import type {
  ImportTavernCardRequest,
  TavernCardUploadTarget,
} from '@/types/tavern-card'
import {
  CHUB_LIBRARY,
  CHUB_LIBRARY_ERRORS,
  type ChubLibraryErrorKind,
} from '@/constants/cards/chub-library'
import { API_ENDPOINTS } from '@/constants/config'

import { getErrorPayload } from '@/lib/api-client/shared'
import { getThrownErrorFields } from '@/lib/api-client/error-fields'
import {
  chubCharacterUrl,
  chubSearchUrl,
  isChubCountryBlock,
  parseChubCharacter,
  parseChubSearch,
} from '@/lib/chub-library'
import { apiFetch } from '@/lib/api-client/api-fetch'

export async function listCharacterCardsAPI(): Promise<CharacterCardsResponse> {
  try {
    const response = await apiFetch(API_ENDPOINTS.CHARACTER_CARDS)
    if (!response.ok) {
      return {
        success: false,
        ...(await getErrorPayload(response)),
      }
    }
    return await response.json()
  } catch (error) {
    return { success: false, ...getThrownErrorFields(error) }
  }
}

export async function createCharacterCardAPI(
  data: CreateCharacterCardRequest,
): Promise<CharacterCardResponse> {
  try {
    const response = await apiFetch(API_ENDPOINTS.CHARACTER_CARDS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      return {
        success: false,
        ...(await getErrorPayload(response)),
      }
    }
    return await response.json()
  } catch (error) {
    return { success: false, ...getThrownErrorFields(error) }
  }
}

/**
 * 导入一张酒馆卡（PNG / JSON）→ 一张角色卡。文件 ⛔ 经过 Vercel：
 *   1. POST `/import/uploads`  → 直传 R2 的 PUT 地址（只报名字、类型、大小）
 *   2. PUT  那个地址           → 浏览器 → R2
 *   3. POST `/import`          → 服务端从 R2 读回来拆卡、建卡
 * 失败带 `i18nKey`，调用方说人话。
 */
export async function importTavernCardAPI(
  file: File,
  mimeType: 'image/png' | 'application/json',
  fileName: string,
  locale: ImportTavernCardRequest['locale'],
): Promise<CharacterCardResponse & { i18nKey?: string }> {
  try {
    const prepareResponse = await apiFetch(
      API_ENDPOINTS.CHARACTER_CARDS_IMPORT_UPLOADS,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName, mimeType, sizeBytes: file.size }),
      },
    )
    if (!prepareResponse.ok) {
      const payload = await getErrorPayload(prepareResponse)
      return { success: false, error: payload.error, i18nKey: payload.i18nKey }
    }
    const prepare = (await prepareResponse.json()) as {
      data: TavernCardUploadTarget
    }

    // 唯一一个跨域请求：浏览器 → R2。抛错多半是桶的 CORS，不是卡坏了。
    const storageResponse = await apiFetch(prepare.data.uploadUrl, {
      method: 'PUT',
      headers: prepare.data.headers,
      body: file,
    }).catch(() => null)
    if (!storageResponse?.ok) {
      return {
        success: false,
        error: `Card storage rejected the upload (status ${storageResponse?.status ?? 'network'})`,
        i18nKey: 'errors.tavernCard.uploadMissing',
      }
    }

    const response = await apiFetch(API_ENDPOINTS.CHARACTER_CARDS_IMPORT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName,
        storageKey: prepare.data.storageKey,
        locale,
      } satisfies ImportTavernCardRequest),
    })
    if (!response.ok) {
      const payload = await getErrorPayload(response)
      return { success: false, error: payload.error, i18nKey: payload.i18nKey }
    }
    return await response.json()
  } catch (error) {
    return { success: false, ...getThrownErrorFields(error) }
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
    const response = await apiFetch(url, {
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
  locale,
}: Pick<ImportChubCardRequest, 'fullPath' | 'locale'>): Promise<
  CharacterCardResponse & { i18nKey?: string }
> {
  const path = ChubFullPathSchema.safeParse(fullPath)
  if (!path.success) return chubFailure('notFound')
  const fetched = await fetchChubJson(chubCharacterUrl(path.data))
  if (!fetched.ok) return chubFailure(fetched.kind)
  const card = parseChubCharacter(fetched.json)
  if (!card.success) return chubFailure(card.reason)

  const body: ImportChubCardRequest = {
    fullPath: path.data,
    node: card.node,
    locale,
  }
  try {
    const response = await apiFetch(API_ENDPOINTS.CHARACTER_CARDS_CHUB_IMPORT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      const payload = await getErrorPayload(response)
      return { success: false, error: payload.error, i18nKey: payload.i18nKey }
    }
    return await response.json()
  } catch (error) {
    return { success: false, ...getThrownErrorFields(error) }
  }
}

export async function getCharacterCardAPI(
  id: string,
): Promise<CharacterCardResponse> {
  try {
    const response = await apiFetch(`${API_ENDPOINTS.CHARACTER_CARDS}/${id}`)
    if (!response.ok) {
      return {
        success: false,
        ...(await getErrorPayload(response)),
      }
    }
    return await response.json()
  } catch (error) {
    return { success: false, ...getThrownErrorFields(error) }
  }
}

export async function updateCharacterCardAPI(
  id: string,
  data: UpdateCharacterCardRequest,
): Promise<CharacterCardResponse> {
  try {
    const response = await apiFetch(`${API_ENDPOINTS.CHARACTER_CARDS}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      return {
        success: false,
        ...(await getErrorPayload(response)),
      }
    }
    return await response.json()
  } catch (error) {
    return { success: false, ...getThrownErrorFields(error) }
  }
}

export async function deleteCharacterCardAPI(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await apiFetch(`${API_ENDPOINTS.CHARACTER_CARDS}/${id}`, {
      method: 'DELETE',
    })
    if (response.status === 204) return { success: true }
    if (!response.ok) {
      return {
        success: false,
        ...(await getErrorPayload(response)),
      }
    }
    return { success: true }
  } catch (error) {
    return { success: false, ...getThrownErrorFields(error) }
  }
}

/** 发一个返回整个角色的写请求（造型增改、复制都走它）。 */
async function sendCharacterCardWrite(
  url: string,
  method: 'POST' | 'PUT',
  body: unknown,
): Promise<CharacterCardResponse & { i18nKey?: string }> {
  try {
    const response = await apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      const payload = await getErrorPayload(response)
      return { success: false, error: payload.error, i18nKey: payload.i18nKey }
    }
    return await response.json()
  } catch (error) {
    return { success: false, ...getThrownErrorFields(error) }
  }
}

/** 复制一位：名字换新，设定、全部造型和她收的 LoRA 都带上（服务端一次做完）。 */
export function duplicateCharacterCardAPI(id: string, name: string) {
  return sendCharacterCardWrite(
    `${API_ENDPOINTS.CHARACTER_CARDS}/${id}/duplicate`,
    'POST',
    { name },
  )
}

/** 给角色加一套造型；返回整个角色。 */
export function createCharacterLookAPI(
  cardId: string,
  data: CreateCharacterLookRequest,
) {
  return sendCharacterCardWrite(
    `${API_ENDPOINTS.CHARACTER_CARDS}/${cardId}/looks`,
    'POST',
    data,
  )
}

/** 改一套造型（名字 · 外观 · 标签 · 图 · 设为默认）；返回整个角色。 */
export function updateCharacterLookAPI(
  lookId: string,
  data: UpdateCharacterLookRequest,
) {
  return sendCharacterCardWrite(
    `${API_ENDPOINTS.CHARACTER_LOOKS}/${lookId}`,
    'PUT',
    data,
  )
}

/** 删一套造型（最后一套删不掉）。 */
export async function deleteCharacterLookAPI(
  lookId: string,
): Promise<{ success: boolean; error?: string; i18nKey?: string }> {
  try {
    const response = await apiFetch(
      `${API_ENDPOINTS.CHARACTER_LOOKS}/${lookId}`,
      {
        method: 'DELETE',
      },
    )
    if (response.ok || response.status === 204) return { success: true }
    const payload = await getErrorPayload(response)
    return { success: false, error: payload.error, i18nKey: payload.i18nKey }
  } catch (error) {
    return { success: false, ...getThrownErrorFields(error) }
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
    const response = await apiFetch(
      `${API_ENDPOINTS.CHARACTER_CARDS}/${id}/sample-lines`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
    )
    if (!response.ok) {
      const payload = await getErrorPayload(response)
      return {
        success: false,
        error: payload.error,
        errorCode: payload.errorCode,
        i18nKey: payload.i18nKey,
      }
    }
    return await response.json()
  } catch (error) {
    return { success: false, ...getThrownErrorFields(error) }
  }
}

/** 聊天里「改写」她那句：存成卡上一段对话示例（只留最近 10 段）。 */
export async function addCharacterExampleAPI(
  id: string,
  example: CharacterExampleAdd,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await apiFetch(
      `${API_ENDPOINTS.CHARACTER_CARDS}/${id}/examples`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(example),
      },
    )
    if (response.ok) return { success: true }
    const payload = await getErrorPayload(response)
    return { success: false, error: payload.error }
  } catch (error) {
    return { success: false, ...getThrownErrorFields(error) }
  }
}

/** 起草（卡片页「对话」一组）：对话示例空着写几段、开场白空着写一句。 */
export async function draftCharacterDialogueAPI(
  id: string,
  kind: CharacterDialogueDraftKind,
): Promise<{
  success: boolean
  data?: CharacterDialogueDraft
  error?: string
  errorCode?: string
  i18nKey?: string
}> {
  try {
    const response = await apiFetch(
      `${API_ENDPOINTS.CHARACTER_CARDS}/${id}/draft-dialogue`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind }),
      },
    )
    if (!response.ok) {
      const payload = await getErrorPayload(response)
      return {
        success: false,
        error: payload.error,
        errorCode: payload.errorCode,
        i18nKey: payload.i18nKey,
      }
    }
    return await response.json()
  } catch (error) {
    return { success: false, ...getThrownErrorFields(error) }
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
    const response = await apiFetch(
      `/api/character-cards/${cardId}/generations?${params}`,
    )
    return await response.json()
  } catch (error) {
    return { success: false, ...getThrownErrorFields(error) }
  }
}
