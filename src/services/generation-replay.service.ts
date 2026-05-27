import 'server-only'

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { ensureUser } from '@/services/user.service'
import { findLoraAssetsByUrls } from '@/services/lora-asset.service'
import type { ReplayPayload } from '@/types'

type AspectRatio = NonNullable<ReplayPayload['aspectRatio']>
const VALID_ASPECT_RATIOS: readonly AspectRatio[] = [
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
]

/**
 * "Use this image" entry-point on a gallery card. Reads a generation's
 * snapshot, extracts everything needed to reproduce the result (LoRAs +
 * prompt + seed + negative prompt + aspect ratio), and returns a focused
 * payload the client turns into Studio URL params.
 *
 * Permission rules:
 *   - Generation must be public OR owned by the viewer.
 *   - LoRA assets must be public OR owned by the viewer. Anything else
 *     contributes to `hasHiddenLoras` but is not surfaced individually.
 *
 * Snapshot is `unknown` in the schema so every read tolerates missing /
 * malformed fields by returning `null`. Phase 1C added the prompt+seed
 * fields without rejecting older generations that never captured them.
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

  const snapshot = isRecord(generation.snapshot) ? generation.snapshot : null
  const advancedParams =
    snapshot && isRecord(snapshot.advancedParams)
      ? snapshot.advancedParams
      : null
  const snapshotLoraUrls = extractLoraUrls(snapshot)

  // Style code resolution: nothing-to-replay shortcut keeps the old
  // {styleCodes: [], hasHiddenLoras: false} behaviour for snapshots with
  // no LoRAs at all.
  let styleCodes: string[] = []
  let hasHiddenLoras = false
  if (snapshotLoraUrls.length > 0) {
    const assets = await findLoraAssetsByUrls(snapshotLoraUrls, viewerUserId)
    styleCodes = assets.map((a) => a.styleCode)
    hasHiddenLoras = styleCodes.length < snapshotLoraUrls.length
  }

  // Phase 1C — prompt / seed / negative / aspect ratio extraction.
  // `freePrompt` is the original user text; `compiledPrompt` is what was
  // actually sent to the provider. We prefer freePrompt because it's
  // what the user typed and what they'd want to keep editing; falls back
  // to compiledPrompt for older snapshots that didn't separate them.
  const prompt =
    pickString(snapshot, 'freePrompt') ?? pickString(snapshot, 'compiledPrompt')
  // Seed lives at snapshot top level (duplicated for quick access) and
  // also inside advancedParams. Take whichever exists; treat -1 as null
  // because -1 means "random" and isn't reproducible anyway.
  const rawSeed =
    pickNumber(snapshot, 'seed') ?? pickNumber(advancedParams, 'seed')
  const seed = rawSeed === null || rawSeed < 0 ? null : rawSeed
  const negativePrompt = pickString(advancedParams, 'negativePrompt')
  const rawAspectRatio = pickString(snapshot, 'aspectRatio')
  const aspectRatio =
    rawAspectRatio &&
    (VALID_ASPECT_RATIOS as readonly string[]).includes(rawAspectRatio)
      ? (rawAspectRatio as AspectRatio)
      : null

  logger.info('Replay payload built', {
    generationId,
    viewer: viewerClerkId ?? 'anonymous',
    visibleCount: styleCodes.length,
    snapshotLoraCount: snapshotLoraUrls.length,
    hasPrompt: prompt !== null,
    hasSeed: seed !== null,
  })

  return {
    generationId: generation.id,
    styleCodes,
    hasHiddenLoras,
    prompt,
    seed,
    negativePrompt,
    aspectRatio,
  }
}

/**
 * Pull `advancedParams.loras[].url` strings out of a snapshot JSON blob.
 * Returns an empty array on any shape mismatch — the snapshot is a
 * defensively-typed `unknown` field so all reads must tolerate stale
 * or malformed payloads.
 */
function extractLoraUrls(snapshot: Record<string, unknown> | null): string[] {
  if (!snapshot) return []
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

function pickString(
  obj: Record<string, unknown> | null,
  key: string,
): string | null {
  if (!obj) return null
  const v = obj[key]
  if (typeof v !== 'string' || v.length === 0) return null
  return v
}

function pickNumber(
  obj: Record<string, unknown> | null,
  key: string,
): number | null {
  if (!obj) return null
  const v = obj[key]
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  return v
}
