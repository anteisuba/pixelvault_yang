import 'server-only'

import { db } from '@/lib/db'
import { generateStorageKey, uploadToR2 } from '@/services/storage/r2'
import { ensureUser } from '@/services/user.service'
import { GenerateImageServiceError } from '@/services/generate-image.service'
import type { GenerationRecord } from '@/types'

const MAX_POSTER_BYTES = 2 * 1024 * 1024 // 2 MB — poster is a small thumbnail

/**
 * Persist a client-captured poster PNG for a MODEL_3D generation.
 *
 * `<ModelViewer>` calls `.toBlob()` once the GLB renders, then POSTs the
 * bytes here. We upload to R2 and overwrite the generation's `url` /
 * `storageKey` (which initially pointed at the GLB) so the asset browser
 * can render a real thumbnail. The GLB itself stays at `modelUrl` /
 * `modelStorageKey` and is untouched.
 */
export async function uploadGenerationPoster(
  clerkId: string,
  generationId: string,
  posterBuffer: Buffer,
  mimeType: string,
): Promise<GenerationRecord> {
  if (posterBuffer.byteLength === 0) {
    throw new GenerateImageServiceError(
      'PROVIDER_ERROR',
      'Poster body is empty',
      400,
    )
  }
  if (posterBuffer.byteLength > MAX_POSTER_BYTES) {
    throw new GenerateImageServiceError(
      'PROVIDER_ERROR',
      `Poster too large (${(posterBuffer.byteLength / 1024 / 1024).toFixed(1)} MB, max ${MAX_POSTER_BYTES / 1024 / 1024} MB)`,
      400,
    )
  }
  if (!mimeType.startsWith('image/')) {
    throw new GenerateImageServiceError(
      'PROVIDER_ERROR',
      `Unsupported poster MIME type: ${mimeType}`,
      400,
    )
  }

  const dbUser = await ensureUser(clerkId)
  const gen = await db.generation.findUnique({ where: { id: generationId } })

  if (!gen) {
    throw new GenerateImageServiceError(
      'JOB_NOT_FOUND',
      'Generation not found',
      404,
    )
  }
  if (gen.userId !== dbUser.id) {
    throw new GenerateImageServiceError('PROVIDER_ERROR', 'Forbidden', 403)
  }
  if (gen.outputType !== 'MODEL_3D') {
    throw new GenerateImageServiceError(
      'PROVIDER_ERROR',
      'Poster upload is only supported for 3D generations',
      400,
    )
  }
  // Idempotency: if `url` already differs from `modelUrl`, a poster was
  // uploaded previously — return current row instead of re-uploading.
  if (gen.modelUrl && gen.url !== gen.modelUrl) {
    return gen as GenerationRecord
  }

  const posterKey = generateStorageKey('IMAGE', dbUser.id)
  const posterUrl = await uploadToR2({
    data: posterBuffer,
    key: posterKey,
    mimeType,
  })

  const updated = await db.generation.update({
    where: { id: generationId },
    data: {
      url: posterUrl,
      storageKey: posterKey,
      mimeType,
    },
  })

  return updated as GenerationRecord
}
