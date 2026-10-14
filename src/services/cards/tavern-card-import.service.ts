import 'server-only'

import {
  TAVERN_CARD,
  TAVERN_CARD_IMPORT_ERRORS,
} from '@/constants/cards/tavern-card'
import type { CharacterCardRecord } from '@/types'
import type { ImportTavernCardRequest } from '@/types/tavern-card'
import { ApiRequestError } from '@/lib/errors'
import {
  extractTavernCardJson,
  mapTavernCard,
  parseTavernCard,
  stripPngTextChunks,
} from '@/lib/tavern-card'
import { createImportedCharacterCard } from '@/services/cards/character-card.service'

/**
 * **导入一张酒馆卡**（附录J ⑥）：PNG 卡或 JSON 卡 → 一张我们的角色卡。
 * 解析与落格是 `lib/tavern-card` 的纯函数；这里只管拆数据地址、判错、交给建卡。
 * PNG 卡的图去掉文本块后当第一张参考图；JSON 卡没有图。
 */

function importError(
  kind: keyof typeof TAVERN_CARD_IMPORT_ERRORS,
): ApiRequestError {
  const error = TAVERN_CARD_IMPORT_ERRORS[kind]
  return new ApiRequestError(
    error.code,
    error.httpStatus,
    error.i18nKey,
    error.message,
  )
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export async function importTavernCard(
  clerkId: string,
  input: ImportTavernCardRequest,
): Promise<CharacterCardRecord> {
  const comma = input.data.indexOf(',')
  const isPngData = input.data.startsWith('data:image/png')
  const bytes = new Uint8Array(
    Buffer.from(input.data.slice(comma + 1), 'base64'),
  )
  if (bytes.byteLength > TAVERN_CARD.MAX_FILE_BYTES) {
    throw importError('tooLarge')
  }

  const jsonText = isPngData
    ? extractTavernCardJson(bytes)
    : new TextDecoder('utf-8').decode(bytes)
  const card = jsonText ? parseTavernCard(parseJson(jsonText)) : null
  if (!card) throw importError('notACard')

  return createImportedCharacterCard(
    clerkId,
    mapTavernCard(card),
    isPngData
      ? {
          data: Buffer.from(stripPngTextChunks(bytes)),
          mimeType: 'image/png',
        }
      : null,
  )
}
