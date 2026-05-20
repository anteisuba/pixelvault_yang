import 'server-only'

import { randomBytes } from 'node:crypto'

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { isOwnedStorageUrl } from '@/services/storage/r2'
import { ensureUser } from '@/services/user.service'
import type {
  LoraAssetRecord,
  LoraAssetSource,
  LoraAssetType,
  LoraAssetBaseFamily,
} from '@/types'

interface LoraAssetRow {
  id: string
  userId: string | null
  styleCode: string
  name: string
  source: string
  type: string
  baseModelFamily: string
  provider: string
  triggerWord: string
  loraUrl: string
  coverImageUrl: string | null
  previewImageUrls: unknown
  defaultScale: number
  isPublic: boolean
  createdAt: Date
}

function toRecord(
  row: LoraAssetRow,
  viewerUserId: string | null,
): LoraAssetRecord {
  const previews = Array.isArray(row.previewImageUrls)
    ? (row.previewImageUrls.filter((u) => typeof u === 'string') as string[])
    : []
  return {
    id: row.id,
    styleCode: row.styleCode,
    name: row.name,
    source: row.source as LoraAssetSource,
    type: row.type as LoraAssetType,
    baseModelFamily: row.baseModelFamily as LoraAssetBaseFamily,
    provider: row.provider,
    triggerWord: row.triggerWord,
    loraUrl: row.loraUrl,
    coverImageUrl: row.coverImageUrl,
    previewImageUrls: previews,
    defaultScale: row.defaultScale,
    isPublic: row.isPublic,
    isOwn: viewerUserId !== null && row.userId === viewerUserId,
    createdAt: row.createdAt.toISOString(),
  }
}

/**
 * Generate a URL-safe style code: `<kind>-<slug>-<4 random chars>`.
 * The random suffix prevents enumeration of private LoRA codes.
 */
export function generateStyleCode(name: string, type: LoraAssetType): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'lora'
  const suffix = randomBytes(2).toString('hex')
  const kind = type === 'style' ? 's' : 'c'
  return `pv-${kind}-${slug}-${suffix}`
}

/**
 * Look up a LoRA asset by its style code. Returns null if:
 *   - the code does not exist, OR
 *   - the asset is private and the viewer is not the owner.
 *
 * Used for both share-link reconstruction (?style=<code>) and
 * cross-tool injection. Curated and public assets are visible to
 * everyone, including signed-out visitors (viewerClerkId = null).
 */
export async function getLoraAssetByStyleCode(
  styleCode: string,
  viewerClerkId: string | null,
): Promise<LoraAssetRecord | null> {
  const row = await db.loraAsset.findUnique({
    where: { styleCode },
  })
  if (!row) return null

  const viewerUserId = viewerClerkId
    ? (await ensureUser(viewerClerkId)).id
    : null

  const isOwn = viewerUserId !== null && row.userId === viewerUserId
  if (!row.isPublic && !isOwn) {
    // Don't leak existence of private codes
    return null
  }

  return toRecord(row, viewerUserId)
}

/**
 * Reverse-lookup LoraAssets by their stored loraUrl, ordered to match
 * the input URL list. Skips rows the viewer can't see (private + not
 * owned). Used by generation-replay to translate a snapshot's
 * `advancedParams.loras[].url` array back into shareable style codes.
 */
export async function findLoraAssetsByUrls(
  urls: string[],
  viewerUserId: string | null,
): Promise<LoraAssetRecord[]> {
  if (urls.length === 0) return []

  const rows = await db.loraAsset.findMany({
    where: { loraUrl: { in: urls } },
  })

  // Index by url for stable input-order output. If the same URL maps to
  // multiple assets (curated + user copy, say), prefer the viewer's own
  // copy, then any public asset.
  const byUrl = new Map<string, typeof rows>()
  for (const row of rows) {
    const existing = byUrl.get(row.loraUrl) ?? []
    existing.push(row)
    byUrl.set(row.loraUrl, existing)
  }

  const pickVisible = (
    candidates: typeof rows,
  ): (typeof rows)[number] | null => {
    const owned = candidates.find((r) => r.userId === viewerUserId)
    if (owned) return owned
    const publicAsset = candidates.find((r) => r.isPublic)
    if (publicAsset) return publicAsset
    return null
  }

  const out: LoraAssetRecord[] = []
  for (const url of urls) {
    const candidates = byUrl.get(url)
    if (!candidates || candidates.length === 0) continue
    const picked = pickVisible(candidates)
    if (picked) out.push(toRecord(picked, viewerUserId))
  }
  return out
}

/**
 * List LoRA assets the viewer can use: their own + all curated.
 * Ordered: owned (newest first) → curated (newest first).
 */
export async function listLoraAssetsForUser(
  clerkId: string,
): Promise<LoraAssetRecord[]> {
  const user = await ensureUser(clerkId)

  const [owned, curated] = await Promise.all([
    db.loraAsset.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    db.loraAsset.findMany({
      where: { source: 'curated', isPublic: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ])

  return [...owned, ...curated].map((row) => toRecord(row, user.id))
}

/**
 * "Discover" feed — public LoRAs trained by other users. Excludes:
 *   - the viewer's own assets (those live in My LoRAs)
 *   - curated assets (already mixed into My LoRAs)
 *   - private assets
 */
export async function listDiscoverLoraAssets(
  clerkId: string | null,
): Promise<LoraAssetRecord[]> {
  const viewerUserId = clerkId ? (await ensureUser(clerkId)).id : null

  const rows = await db.loraAsset.findMany({
    where: {
      isPublic: true,
      source: 'trained',
      ...(viewerUserId ? { userId: { not: viewerUserId } } : {}),
    },
    orderBy: [{ usageCount: 'desc' }, { createdAt: 'desc' }],
    take: 60,
  })

  return rows.map((row) => toRecord(row, viewerUserId))
}

/**
 * Flip a LoraAsset's `isPublic` flag. Only the owner can do this;
 * curated platform LoRAs (no userId) can't be toggled by anyone here.
 * Returns the updated record so the client can swap optimistic state
 * for the canonical row in one round-trip.
 */
export async function setLoraAssetVisibility(
  clerkId: string,
  loraAssetId: string,
  isPublic: boolean,
): Promise<LoraAssetRecord | null> {
  const user = await ensureUser(clerkId)
  const row = await db.loraAsset.findUnique({ where: { id: loraAssetId } })
  if (!row) return null
  if (row.userId !== user.id) {
    throw new Error('Not authorized to modify this LoRA')
  }

  const updated = await db.loraAsset.update({
    where: { id: loraAssetId },
    data: { isPublic },
  })

  logger.info('LoraAsset visibility changed', {
    loraAssetId,
    userId: user.id,
    isPublic,
  })

  return toRecord(updated, user.id)
}

/**
 * Replace a LoraAsset's `coverImageUrl` — typically swapping the default
 * (first training image) for a generated sample or a different training
 * image. Only the owner can do this. The cover must be hosted on our own
 * R2 bucket (training images, generation outputs, uploaded assets) so we
 * don't display attacker-controlled URLs in LoRA cards.
 */
export async function updateLoraAssetCover(
  clerkId: string,
  loraAssetId: string,
  coverImageUrl: string,
): Promise<LoraAssetRecord | null> {
  const user = await ensureUser(clerkId)
  const row = await db.loraAsset.findUnique({ where: { id: loraAssetId } })
  if (!row) return null
  if (row.userId !== user.id) {
    throw new Error('Not authorized to modify this LoRA')
  }
  if (!isOwnedStorageUrl(coverImageUrl)) {
    throw new Error('Cover image must be hosted on our storage bucket')
  }

  const updated = await db.loraAsset.update({
    where: { id: loraAssetId },
    data: { coverImageUrl },
  })

  logger.info('LoraAsset cover updated', {
    loraAssetId,
    userId: user.id,
    coverImageUrl,
  })

  return toRecord(updated, user.id)
}

/**
 * Import a Civitai LoRA into the viewer's "Favorites" (source = 'imported').
 * Idempotent on (userId, loraUrl): returns the existing row if present.
 * Visible only to the owner — favorites are personal, not republished.
 */
export async function favoriteExternalLora(
  clerkId: string,
  input: {
    name: string
    triggerWord: string
    loraUrl: string
    type: LoraAssetType
    baseModelFamily: string
    provider: string
    coverImageUrl?: string | null
  },
): Promise<LoraAssetRecord> {
  const user = await ensureUser(clerkId)

  const existing = await db.loraAsset.findFirst({
    where: { userId: user.id, loraUrl: input.loraUrl },
  })
  if (existing) return toRecord(existing, user.id)

  const styleCode = await reserveUniqueStyleCode(input.name, input.type)
  const created = await db.loraAsset.create({
    data: {
      userId: user.id,
      name: input.name,
      styleCode,
      source: 'imported',
      type: input.type,
      baseModelFamily: input.baseModelFamily,
      provider: input.provider,
      triggerWord: input.triggerWord,
      loraUrl: input.loraUrl,
      coverImageUrl: input.coverImageUrl ?? null,
      defaultScale: 1.0,
      isPublic: false,
    },
  })

  logger.info('LoraAsset favorited (imported)', {
    userId: user.id,
    styleCode,
    loraUrl: input.loraUrl,
  })

  return toRecord(created, user.id)
}

/**
 * Remove a user's favorite (only imported assets — trained/curated stay put).
 * Returns true if a row was deleted.
 */
export async function unfavoriteLora(
  clerkId: string,
  loraAssetId: string,
): Promise<boolean> {
  const user = await ensureUser(clerkId)
  const row = await db.loraAsset.findUnique({ where: { id: loraAssetId } })
  if (!row || row.userId !== user.id) return false
  if (row.source !== 'imported') {
    throw new Error('Only imported favorites can be removed this way')
  }
  await db.loraAsset.delete({ where: { id: loraAssetId } })
  logger.info('LoraAsset unfavorited', { userId: user.id, loraAssetId })
  return true
}

/**
 * Map the LoraTrainingJob.baseModel column (a provider-routed string like
 * 'flux-dev', 'flux-dev-fal', 'sdxl', 'illustrious') onto the
 * baseModelFamily bucket used by the Studio LoRA chip + capability matching.
 * Trainers we support today land in flux or sdxl families; this helper is the
 * single place to extend when new trainer base options come online.
 */
function inferBaseModelFamily(jobBaseModel: string): LoraAssetBaseFamily {
  const v = jobBaseModel.toLowerCase()
  if (v.includes('flux')) return 'flux'
  // Illustrious and Pony are both SDXL-architecture finetunes — Studio's
  // SDXL family bucket already groups them with NoobAI / delta-lock.
  if (
    v.includes('sdxl') ||
    v.includes('illustrious') ||
    v.includes('pony') ||
    v.includes('noobai')
  ) {
    return 'sdxl'
  }
  return 'flux'
}

/** Resolve an R2 storage key (e.g. `lora-training/{userId}/{ts}-0.png`) to
 *  the public CDN URL. Mirrors the join used in `uploadToR2`'s return value
 *  so cover / preview URLs stay in sync with where the bytes actually live. */
function storageKeyToPublicUrl(key: string): string {
  return `${process.env.NEXT_PUBLIC_STORAGE_BASE_URL}/${key}`
}

/**
 * Idempotently create a LoraAsset from a completed LoraTrainingJob.
 * Called by lora-training.service when a job reaches COMPLETED.
 */
export async function ensureLoraAssetFromTrainingJob(
  jobId: string,
): Promise<void> {
  const job = await db.loraTrainingJob.findUnique({
    where: { id: jobId },
    include: { loraAsset: true },
  })
  if (!job) return
  if (job.status !== 'COMPLETED' || !job.loraUrl) return
  if (job.loraAsset) return // already created

  const type: LoraAssetType = job.loraType === 'style' ? 'style' : 'subject'
  const styleCode = await reserveUniqueStyleCode(job.name, type)

  // First training image is the default cover; the full list seeds the LoRA
  // card's preview gallery. Both fields are nullable in the DB so older jobs
  // without trainingImageKeys still get a valid (no-cover) asset record.
  const imageUrls = (job.trainingImageKeys ?? []).map(storageKeyToPublicUrl)
  const coverImageUrl = imageUrls[0] ?? null

  await db.loraAsset.create({
    data: {
      userId: job.userId,
      name: job.name,
      styleCode,
      source: 'trained',
      type,
      baseModelFamily: inferBaseModelFamily(job.baseModel),
      provider: job.baseModel.endsWith('-fal') ? 'fal' : 'replicate',
      triggerWord: job.triggerWord,
      loraUrl: job.loraUrl,
      storageKey: job.loraStorageKey,
      coverImageUrl,
      previewImageUrls: imageUrls,
      defaultScale: 1.0,
      isPublic: false,
      trainingJobId: job.id,
    },
  })

  logger.info('LoraAsset created from training job', {
    jobId,
    styleCode,
    userId: job.userId,
    coverImageUrl,
    previewCount: imageUrls.length,
  })
}

/**
 * Try up to 5 times to mint a unique style code. Collisions on the
 * 4-char suffix are vanishingly rare (~6M codes per slug), but we
 * loop defensively to keep the @unique constraint happy.
 */
async function reserveUniqueStyleCode(
  name: string,
  type: LoraAssetType,
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateStyleCode(name, type)
    const existing = await db.loraAsset.findUnique({
      where: { styleCode: code },
      select: { id: true },
    })
    if (!existing) return code
  }
  throw new Error('Failed to mint unique style code after 5 attempts')
}
