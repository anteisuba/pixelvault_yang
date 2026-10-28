import { API_ENDPOINTS } from '@/constants/config'
import { getErrorPayload } from '@/lib/api-client/shared'
import type {
  CharacterStickerRecord,
  UpdateCharacterStickerRequest,
} from '@/types/character-sticker'

/**
 * **她的表情包**的客户端封装（4d，角色页右栏）：列、上传一张、拉黑 / 恢复、删。
 * 形状照抄 `api-client/character-growth.ts`；失败带 `status`，上传那一格按它说人话
 * （413 = 太大、400 = 不是图）。
 */

type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; status?: number }

async function parse<T>(
  response: Response,
  fallback: string,
): Promise<ApiResult<T>> {
  if (!response.ok) {
    const payload = await getErrorPayload(response, fallback)
    return { success: false, error: payload.error, status: response.status }
  }
  const body = (await response.json()) as { success?: boolean; data?: T }
  if (!body.success) return { success: false, error: fallback }
  return { success: true, data: body.data as T }
}

const toFailure = (error: unknown, fallback: string): ApiResult<never> => ({
  success: false,
  error: error instanceof Error ? error.message : fallback,
})

const cardStickers = (cardId: string) =>
  `${API_ENDPOINTS.CHARACTER_CARDS}/${encodeURIComponent(cardId)}/stickers`
const stickerUrl = (stickerId: string) =>
  `${API_ENDPOINTS.CHARACTER_STICKERS}/${encodeURIComponent(stickerId)}`

export async function listCharacterStickersAPI(
  cardId: string,
): Promise<ApiResult<CharacterStickerRecord[]>> {
  try {
    const response = await fetch(cardStickers(cardId), {
      headers: { Accept: 'application/json' },
    })
    return await parse(response, 'Failed to load stickers')
  } catch (error) {
    return toFailure(error, 'Failed to load stickers')
  }
}

export async function uploadCharacterStickerAPI(
  cardId: string,
  image: File,
  whenToUse?: string,
): Promise<ApiResult<CharacterStickerRecord>> {
  try {
    const form = new FormData()
    form.append('image', image)
    if (whenToUse) form.append('whenToUse', whenToUse)
    const response = await fetch(cardStickers(cardId), {
      method: 'POST',
      body: form,
    })
    return await parse(response, 'Failed to upload sticker')
  } catch (error) {
    return toFailure(error, 'Failed to upload sticker')
  }
}

export async function updateCharacterStickerAPI(
  stickerId: string,
  input: UpdateCharacterStickerRequest,
): Promise<ApiResult<unknown>> {
  try {
    const response = await fetch(stickerUrl(stickerId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return await parse(response, 'Failed to save sticker')
  } catch (error) {
    return toFailure(error, 'Failed to save sticker')
  }
}

export async function deleteCharacterStickerAPI(
  stickerId: string,
): Promise<ApiResult<unknown>> {
  try {
    const response = await fetch(stickerUrl(stickerId), { method: 'DELETE' })
    return await parse(response, 'Failed to delete sticker')
  } catch (error) {
    return toFailure(error, 'Failed to delete sticker')
  }
}
