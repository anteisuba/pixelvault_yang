import 'server-only'

import { db } from '@/lib/db'
import {
  detectTrustedImageMime,
  generateStorageKey,
  uploadToR2,
} from '@/services/storage/r2'
import { ensureUser } from '@/services/user.service'
import { GenerateImageServiceError } from '@/services/image/generate-image.service'
import type { GenerationRecord } from '@/types'

const MAX_POSTER_BYTES = 2 * 1024 * 1024 // 2 MB — poster is a small thumbnail

/**
 * Persist a client-captured poster for a VIDEO or MODEL_3D generation.
 *
 * 3D keeps its historical behavior: the poster becomes `url` while the GLB
 * stays at `modelUrl`. Video keeps its media URL untouched and stores the
 * captured frame in the dedicated thumbnail fields.
 */
export async function uploadGenerationPoster(
  clerkId: string,
  generationId: string,
  posterBuffer: Buffer,
  // The route-supplied content-type is no longer trusted; we re-derive
  // it from the buffer's magic bytes below. The arg stays for the call
  // signature so the route's early MIME-prefix sniff still works as a
  // fast-reject.
  _claimedMimeType: string,
): Promise<GenerationRecord> {
  void _claimedMimeType

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

  // Trust libvips, not the client header. The 3D viewer captures the
  // canvas as image/png via `.toBlob()`, so the strict allow-list
  // (jpeg/png/webp/gif) is enough. SVG is intentionally excluded
  // because it can carry inline scripts.
  let trustedMimeType: string
  try {
    const detected = await detectTrustedImageMime(posterBuffer)
    trustedMimeType = detected.mimeType
  } catch (error) {
    throw new GenerateImageServiceError(
      'PROVIDER_ERROR',
      error instanceof Error ? error.message : 'Invalid poster image',
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
  if (gen.outputType !== 'MODEL_3D' && gen.outputType !== 'VIDEO') {
    throw new GenerateImageServiceError(
      'PROVIDER_ERROR',
      'Poster upload is only supported for video and 3D generations',
      400,
    )
  }
  // Idempotency: use the type-appropriate poster field.
  if (
    (gen.outputType === 'VIDEO' && gen.thumbnailUrl) ||
    (gen.outputType === 'MODEL_3D' && gen.modelUrl && gen.url !== gen.modelUrl)
  ) {
    return gen as GenerationRecord
  }

  const posterKey = generateStorageKey('IMAGE', dbUser.id)
  const posterUrl = await uploadToR2({
    data: posterBuffer,
    key: posterKey,
    mimeType: trustedMimeType,
  })

  const updated = await db.generation.update({
    where: { id: generationId },
    data:
      gen.outputType === 'VIDEO'
        ? {
            thumbnailUrl: posterUrl,
            thumbnailStorageKey: posterKey,
          }
        : {
            url: posterUrl,
            storageKey: posterKey,
            mimeType: trustedMimeType,
          },
  })

  return updated as GenerationRecord
}
