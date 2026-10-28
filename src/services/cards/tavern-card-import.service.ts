import 'server-only'

import { randomBytes } from 'node:crypto'

import {
  TAVERN_CARD,
  TAVERN_CARD_IMPORT_ERRORS,
} from '@/constants/cards/tavern-card'
import { USER_UPLOAD_DIRECT_URL_EXPIRES_SECONDS } from '@/constants/uploads'
import type { CharacterCardRecord } from '@/types'
import type {
  ImportTavernCardRequest,
  PrepareTavernCardUploadRequest,
  TavernCardUploadTarget,
} from '@/types/tavern-card'
import { ApiRequestError } from '@/lib/errors'
import { isPng, stripPngTextChunks } from '@/lib/png-text-chunks'
import {
  extractTavernCardJson,
  mapTavernCard,
  parseTavernCard,
} from '@/lib/tavern-card'
import { createImportedCharacterCard } from '@/services/cards/character-card.service'
import {
  createPresignedR2PutUrl,
  deleteFromR2,
  getR2ObjectBuffer,
} from '@/services/storage/r2'
import { ensureUser } from '@/services/user.service'

/**
 * **导入一张酒馆卡**（附录J ⑥）：PNG 卡或 JSON 卡 → 一张我们的角色卡。
 * 文件由浏览器直传 R2（owner 2026-10-28：⛔ 经过 Vercel，大卡不再被 4.5 MB 请求体挡住）：
 * ① `prepareTavernCardUpload` 签一个 PUT 地址；② 浏览器 PUT；③ `importTavernCard` 从 R2
 * 读回来拆卡，读完不管成没成都删掉。解析与落格是 `lib/tavern-card` 的纯函数。
 * PNG 卡的图去掉文本块后当第一张参考图；JSON 卡没有图。
 * ⚠ 第 ② 步传完却没走第 ③ 步（中途关页）的文件会留在 `tavern-imports/` 下。
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

function uploadKeyPrefix(userId: string): string {
  return `${TAVERN_CARD.UPLOAD_KEY_PREFIX}/${userId}/`
}

export async function prepareTavernCardUpload(
  clerkId: string,
  input: PrepareTavernCardUploadRequest,
): Promise<TavernCardUploadTarget> {
  const dbUser = await ensureUser(clerkId)
  const ext = input.mimeType === 'image/png' ? 'png' : 'json'
  const storageKey = `${uploadKeyPrefix(dbUser.id)}${Date.now()}-${randomBytes(
    6,
  ).toString('hex')}.${ext}`
  const uploadUrl = await createPresignedR2PutUrl({
    key: storageKey,
    mimeType: input.mimeType,
    expiresInSeconds: USER_UPLOAD_DIRECT_URL_EXPIRES_SECONDS,
  })
  return {
    uploadUrl,
    storageKey,
    headers: { 'Content-Type': input.mimeType, 'If-None-Match': '*' },
  }
}

export async function importTavernCard(
  clerkId: string,
  input: ImportTavernCardRequest,
): Promise<CharacterCardRecord> {
  const dbUser = await ensureUser(clerkId)
  const key = input.storageKey
  if (!key.startsWith(uploadKeyPrefix(dbUser.id)) || key.includes('..')) {
    throw importError('uploadMissing')
  }

  let bytes: Uint8Array
  try {
    const object = await getR2ObjectBuffer({
      key,
      maxBytes: TAVERN_CARD.UPLOAD_MAX_BYTES,
    })
    bytes = new Uint8Array(object.buffer)
  } catch (error) {
    await deleteFromR2(key).catch(() => undefined)
    const tooLarge =
      error instanceof Error && error.message.includes('exceeds maximum size')
    throw importError(tooLarge ? 'tooLarge' : 'uploadMissing')
  }
  await deleteFromR2(key).catch(() => undefined)

  // 认字节不认后缀 / 类型头：PNG 签名对得上就当 PNG 卡，否则当 JSON 读。
  const png = isPng(bytes)
  const jsonText = png
    ? extractTavernCardJson(bytes)
    : new TextDecoder('utf-8').decode(bytes)
  const card = jsonText ? parseTavernCard(parseJson(jsonText)) : null
  if (!card) throw importError('notACard')

  return createImportedCharacterCard(
    clerkId,
    mapTavernCard(card),
    png
      ? {
          data: Buffer.from(stripPngTextChunks(bytes)),
          mimeType: 'image/png',
        }
      : null,
  )
}
