import 'server-only'

import { IMAGE_TAGGER } from '@/constants/image-tagger'
import { db } from '@/lib/db'
import {
  ImageTaggerResultSchema,
  type ImageTaggerResult,
} from '@/types/image-tagger'
import { tagImageViaWorker } from '@/services/execution-worker.service'

/**
 * 认图（PixAI Tagger）：给一张图的地址，回 Danbooru 标签（画师 / 角色 / 作品 / 内容）与置信度。
 *
 * ⭐ 库里的图认一次就存进它的 `snapshot.tagger`，下次直接读（换模型版本才重认）；
 *   认的是原图（缩略图太小，模型吃 1008²），台上 / 附图给的缩略图地址也先认回库里那一行。
 * ⭐ 不在库里的地址（网上的图）照认，只是不存。
 */

interface StoredReading {
  version: string
  result: unknown
}

interface LibraryRow {
  id: string
  url: string
  tagger: StoredReading | null
}

async function findLibraryRow(
  userId: string,
  url: string,
): Promise<LibraryRow | null> {
  const rows = await db.$queryRaw<LibraryRow[]>`
    SELECT "id", "url", "snapshot"->${IMAGE_TAGGER.SNAPSHOT_KEY} AS "tagger"
      FROM "Generation"
     WHERE "userId" = ${userId}
       AND "outputType" = 'IMAGE'
       AND ("url" = ${url} OR "thumbnailUrl" = ${url})
     ORDER BY "createdAt" DESC
     LIMIT 1`
  return rows[0] ?? null
}

function storedResult(row: LibraryRow): ImageTaggerResult | null {
  if (row.tagger?.version !== IMAGE_TAGGER.MODEL_VERSION) return null
  const parsed = ImageTaggerResultSchema.safeParse(row.tagger.result)
  return parsed.success ? parsed.data : null
}

async function store(
  row: LibraryRow,
  result: ImageTaggerResult,
): Promise<void> {
  const reading = JSON.stringify({
    version: IMAGE_TAGGER.MODEL_VERSION,
    at: new Date().toISOString(),
    result,
  })
  await db.$executeRaw`
    UPDATE "Generation"
       SET "snapshot" = jsonb_set(COALESCE("snapshot", '{}'::jsonb), ${[IMAGE_TAGGER.SNAPSHOT_KEY]}::text[], ${reading}::jsonb)
     WHERE "id" = ${row.id}`
}

export async function tagPicture(
  userId: string,
  url: string,
): Promise<ImageTaggerResult> {
  const row = await findLibraryRow(userId, url)
  if (row) {
    const cached = storedResult(row)
    if (cached) return cached
  }
  const target = row?.url ?? url
  if (!target.startsWith('https://'))
    throw new Error('Only https pictures can be tagged.')
  const result = ImageTaggerResultSchema.parse(
    await tagImageViaWorker(target, IMAGE_TAGGER.TIMEOUT_MS),
  )
  // 存不上不影响这一次的结果。
  if (row) await store(row, result).catch(() => undefined)
  return result
}
