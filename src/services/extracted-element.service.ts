import 'server-only'

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import type { ExtractedElementRecord } from '@/types'

import {
  createImagePreviewAssets,
  deleteFromR2,
  fetchAsBuffer,
  generateStorageKey,
  uploadToR2,
} from './storage/r2'

const MAX_EXTRACTED_BYTES = 20 * 1024 * 1024 // 20 MB — generative outputs run ~5MB

type ExtractProvider = 'fal' | 'gemini' | 'openai'

function providerFromModelId(modelId: string): ExtractProvider {
  if (modelId.startsWith('gemini-')) return 'gemini'
  if (modelId.startsWith('gpt-image-')) return 'openai'
  return 'fal'
}

interface ExtractedElementRow {
  id: string
  name: string
  prompt: string
  invert: boolean
  provider: string
  modelId: string
  sourceGenerationId: string | null
  sourceImageUrl: string
  extractedUrl: string
  thumbnailUrl: string | null
  width: number
  height: number
  createdAt: Date
}

/**
 * Project a DB row to the wire-format record. Coerces provider to the union
 * and ISO-formats the timestamp so the client doesn't have to.
 */
function toRecord(row: ExtractedElementRow): ExtractedElementRecord {
  return {
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    invert: row.invert,
    provider: row.provider as ExtractProvider,
    modelId: row.modelId,
    sourceGenerationId: row.sourceGenerationId,
    sourceImageUrl: row.sourceImageUrl,
    extractedUrl: row.extractedUrl,
    thumbnailUrl: row.thumbnailUrl,
    width: row.width,
    height: row.height,
    createdAt: row.createdAt.toISOString(),
  }
}

/**
 * Persist a cutout the user just produced. Re-hosts the input image to R2
 * under the user's namespace (the input is normally a transient data URL
 * coming straight from Gemini / GPT, or a fal-hosted URL that may expire),
 * generates thumbnail + preview derivatives, and writes the DB row.
 *
 * The source image URL is recorded verbatim — we don't re-host it here
 * because for internal generations it already lives in our R2, and for
 * external sources the user-supplied URL is what we want to remember.
 */
export async function createExtractedElement(params: {
  userId: string
  extractedImageUrl: string
  sourceImageUrl: string
  sourceGenerationId?: string | null
  prompt: string
  invert: boolean
  modelId: string
  name?: string | null
}): Promise<ExtractedElementRecord> {
  const { buffer, mimeType } = await fetchAsBuffer(params.extractedImageUrl, {
    maxBytes: MAX_EXTRACTED_BYTES,
  })

  const storageKey = generateStorageKey('IMAGE', params.userId)
  const [permanentUrl, previewAssets] = await Promise.all([
    uploadToR2({ data: buffer, key: storageKey, mimeType }),
    createImagePreviewAssets({
      sourceBuffer: buffer,
      sourceStorageKey: storageKey,
    }),
  ])

  // Width/height come back from the preview pipeline's source metadata, but
  // since we already have the buffer it's simpler to re-read here than to
  // thread the values out of createImagePreviewAssets.
  const sharp = (await import('sharp')).default
  const meta = await sharp(buffer).metadata()
  const width = meta.width ?? 1024
  const height = meta.height ?? 1024

  const trimmedName = params.name?.trim() ?? ''
  const fallbackName = params.prompt.trim().slice(0, 80) || 'Extracted element'
  const provider = providerFromModelId(params.modelId)

  // Verify the caller actually owns the generation they're claiming as the
  // source. Without this check a client could POST any generation ID — even
  // one belonging to another user — and our LoRA / Studio replay paths
  // would then surface that foreign generation as the "origin" of this
  // cutout. Silently strip mismatches (don't 400 the whole save) and log
  // so we'd notice an exploit attempt.
  let sourceGenerationId: string | null = params.sourceGenerationId ?? null
  if (sourceGenerationId) {
    const owner = await db.generation.findUnique({
      where: { id: sourceGenerationId },
      select: { userId: true },
    })
    if (!owner || owner.userId !== params.userId) {
      logger.warn(
        'Stripping sourceGenerationId — caller does not own the generation',
        {
          callerUserId: params.userId,
          sourceGenerationId,
          foundOwner: owner?.userId ?? null,
        },
      )
      sourceGenerationId = null
    }
  }

  const row = await db.extractedElement.create({
    data: {
      userId: params.userId,
      sourceGenerationId,
      sourceImageUrl: params.sourceImageUrl,
      extractedUrl: permanentUrl,
      extractedStorageKey: storageKey,
      thumbnailUrl: previewAssets.thumbnailUrl,
      thumbnailStorageKey: previewAssets.thumbnailStorageKey,
      width,
      height,
      name: trimmedName || fallbackName,
      prompt: params.prompt,
      invert: params.invert,
      provider,
      modelId: params.modelId,
    },
  })

  return toRecord(row)
}

/**
 * Paginated list for the asset library + reference picker. Newest first.
 * `cursor` is the createdAt of the last item from the previous page.
 */
export async function listExtractedElementsForUser(
  userId: string,
  params: { limit?: number; cursor?: string } = {},
): Promise<{ items: ExtractedElementRecord[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(params.limit ?? 24, 1), 60)
  const where: Record<string, unknown> = { userId }
  if (params.cursor) {
    const parsedCursor = new Date(params.cursor)
    if (!Number.isNaN(parsedCursor.getTime())) {
      where.createdAt = { lt: parsedCursor }
    }
  }

  const rows = await db.extractedElement.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
  })

  const hasMore = rows.length > limit
  const items = (hasMore ? rows.slice(0, limit) : rows).map(toRecord)
  const nextCursor = hasMore ? rows[limit - 1].createdAt.toISOString() : null

  return { items, nextCursor }
}

/**
 * Delete one element + best-effort R2 cleanup. R2 deletes are fire-and-forget
 * (logged, not awaited) so a transient S3 hiccup doesn't strand the DB row.
 */
export async function deleteExtractedElement(
  userId: string,
  id: string,
): Promise<{ deleted: boolean }> {
  const row = await db.extractedElement.findUnique({ where: { id } })
  if (!row || row.userId !== userId) {
    return { deleted: false }
  }

  await db.extractedElement.delete({ where: { id } })

  const keysToDelete = [
    row.extractedStorageKey,
    row.thumbnailStorageKey,
  ].filter((k): k is string => typeof k === 'string' && k.length > 0)
  void Promise.allSettled(keysToDelete.map((key) => deleteFromR2(key))).then(
    (results) => {
      for (const r of results) {
        if (r.status === 'rejected') {
          logger.warn('[extracted-element] R2 cleanup failed', {
            error: String(r.reason),
          })
        }
      }
    },
  )

  return { deleted: true }
}
