import 'server-only'

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { ensureUser } from '@/services/user.service'
import { findLoraAssetsByUrls } from '@/services/lora-asset.service'
import type { ReplayPayload } from '@/types'

/**
 * "Use this image" entry-point on a gallery card. Reads a generation's
 * snapshot, extracts the LoRA URLs it used, reverse-resolves them to
 * shareable style codes the viewer is allowed to see, and returns a
 * focused payload the client can turn into `?style=...` URL params.
 *
 * Permission rules:
 *   - Generation must be public OR owned by the viewer.
 *   - LoRA assets must be public OR owned by the viewer. Anything else
 *     contributes to `hasHiddenLoras` but is not surfaced individually.
 */
export async function getReplayPayload(
  generationId: string,
  viewerClerkId: string | null,
): Promise<ReplayPayload | null> {
  const generation = await db.generation.findUnique({
    where: { id: generationId },
    select: {
      id: true,
      userId: true,
      isPublic: true,
      snapshot: true,
    },
  })

  if (!generation) return null

  const viewerUserId = viewerClerkId
    ? (await ensureUser(viewerClerkId)).id
    : null
  const isOwner = viewerUserId !== null && generation.userId === viewerUserId

  if (!generation.isPublic && !isOwner) {
    // Don't leak existence of private generations
    return null
  }

  const snapshotLoraUrls = extractLoraUrls(generation.snapshot)
  if (snapshotLoraUrls.length === 0) {
    return {
      generationId: generation.id,
      styleCodes: [],
      hasHiddenLoras: false,
    }
  }

  const assets = await findLoraAssetsByUrls(snapshotLoraUrls, viewerUserId)
  const visibleStyleCodes = assets.map((a) => a.styleCode)
  const hasHiddenLoras = visibleStyleCodes.length < snapshotLoraUrls.length

  logger.info('Replay payload built', {
    generationId,
    viewer: viewerClerkId ?? 'anonymous',
    visibleCount: visibleStyleCodes.length,
    snapshotLoraCount: snapshotLoraUrls.length,
  })

  return {
    generationId: generation.id,
    styleCodes: visibleStyleCodes,
    hasHiddenLoras,
  }
}

/**
 * Pull `advancedParams.loras[].url` strings out of a snapshot JSON blob.
 * Returns an empty array on any shape mismatch — the snapshot is a
 * defensively-typed `unknown` field so all reads must tolerate stale
 * or malformed payloads.
 */
function extractLoraUrls(snapshot: unknown): string[] {
  if (!isRecord(snapshot)) return []
  const advancedParams = snapshot.advancedParams
  if (!isRecord(advancedParams)) return []
  const loras = advancedParams.loras
  if (!Array.isArray(loras)) return []
  return loras
    .filter(
      (entry): entry is { url: string } =>
        isRecord(entry) &&
        typeof entry.url === 'string' &&
        entry.url.length > 0,
    )
    .map((entry) => entry.url)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
