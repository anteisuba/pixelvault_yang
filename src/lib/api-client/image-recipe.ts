/**
 * 台上「从图读串」（owner 2026-10-25）：图先直传到 R2 的临时键，再让服务端读配方 /
 * 认标签（读完就删，⛔ 不进素材库）。⛔ 字节不走 Vercel 请求体（4.5 MB 硬顶装不下大 PNG）。
 */

import { API_ENDPOINTS } from '@/constants/config'
import { getErrorPayload } from '@/lib/api-client/shared'
import {
  ImageRecipeReadingSchema,
  type ImageRecipePrepare,
  type ImageRecipeReading,
} from '@/types/image-recipe'

export type ImageRecipeReadResponse =
  | { success: true; data: ImageRecipeReading }
  | { success: false; error: string; i18nKey?: string }

async function post(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; data: unknown } | ImageRecipeReadResponse> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const payload = await getErrorPayload(
      response,
      `Request failed with status ${response.status}`,
    )
    return {
      success: false,
      error: payload.error,
      ...(payload.i18nKey ? { i18nKey: payload.i18nKey } : {}),
    }
  }
  const payload = (await response.json()) as { data?: unknown }
  return { ok: true, data: payload.data }
}

export async function readImageRecipeAPI(
  file: File,
): Promise<ImageRecipeReadResponse> {
  try {
    const prepare = await post(API_ENDPOINTS.IMAGE_RECIPE_PREPARE, {
      mimeType: file.type,
      sizeBytes: file.size,
    })
    if (!('ok' in prepare)) return prepare
    const { uploadUrl, storageKey, headers } =
      prepare.data as ImageRecipePrepare

    let stored: Response
    try {
      stored = await fetch(uploadUrl, { method: 'PUT', headers, body: file })
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'network error',
        i18nKey: 'errors.upload.storageUnreachable',
      }
    }
    if (!stored.ok)
      return {
        success: false,
        error: `Image storage rejected the upload (status ${stored.status})`,
        i18nKey: 'errors.upload.storageRejected',
      }

    return await readBy({ storageKey })
  } catch (error) {
    return failed(error)
  }
}

/** 素材库里的一张：不用再传，服务端按那一行读。 */
export async function readLibraryImageRecipeAPI(
  generationId: string,
): Promise<ImageRecipeReadResponse> {
  try {
    return await readBy({ generationId })
  } catch (error) {
    return failed(error)
  }
}

async function readBy(
  body: { storageKey: string } | { generationId: string },
): Promise<ImageRecipeReadResponse> {
  const read = await post(API_ENDPOINTS.IMAGE_RECIPE_READ, body)
  if (!('ok' in read)) return read
  const reading = ImageRecipeReadingSchema.safeParse(read.data)
  return reading.success
    ? { success: true, data: reading.data }
    : { success: false, error: 'Unexpected response' }
}

function failed(error: unknown): ImageRecipeReadResponse {
  return {
    success: false,
    error:
      error instanceof Error ? error.message : 'An unexpected error occurred',
  }
}
