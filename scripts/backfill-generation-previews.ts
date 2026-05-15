/**
 * Backfill thumbnail/preview WebP derivatives for historical IMAGE generations.
 *
 * Usage:
 *   npx tsx scripts/backfill-generation-previews.ts --dry-run
 *   npx tsx scripts/backfill-generation-previews.ts --limit=100 --concurrency=3
 *   npx tsx scripts/backfill-generation-previews.ts --force
 *
 * The script is idempotent by default: it only processes IMAGE rows missing
 * thumbnailUrl or previewUrl. Use --force to regenerate both derivatives.
 */

import { config } from 'dotenv'
import { resolve } from 'node:path'
import { PrismaPg } from '@prisma/adapter-pg'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import sharp from 'sharp'

import { PrismaClient } from '../src/lib/generated/prisma/client'

config({ path: resolve(import.meta.dirname, '..', '.env.local') })

const THUMBNAIL_MAX_SIZE = 384
const PREVIEW_MAX_SIZE = 1280
const WEBP_MIME_TYPE = 'image/webp'
const DEFAULT_BATCH_SIZE = 50
const DEFAULT_CONCURRENCY = 3
const REQUIRED_GENERATION_COLUMNS = [
  'thumbnailUrl',
  'thumbnailStorageKey',
  'previewUrl',
  'previewStorageKey',
] as const

interface CliOptions {
  dryRun: boolean
  force: boolean
  limit?: number
  batchSize: number
  concurrency: number
}

interface BackfillGeneration {
  id: string
  url: string
  storageKey: string
  mimeType: string
  thumbnailUrl: string | null
  previewUrl: string | null
}

interface DerivativeAssets {
  thumbnailUrl: string
  thumbnailStorageKey: string
  previewUrl: string
  previewStorageKey: string
}

function readNumberArg(name: string): number | undefined {
  const prefix = `--${name}=`
  const raw = process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length)
  if (!raw) return undefined
  const value = Number.parseInt(raw, 10)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid --${name} value: ${raw}`)
  }
  return value
}

function readCliOptions(): CliOptions {
  return {
    dryRun: process.argv.includes('--dry-run'),
    force: process.argv.includes('--force'),
    limit: readNumberArg('limit'),
    batchSize: readNumberArg('batch-size') ?? DEFAULT_BATCH_SIZE,
    concurrency: readNumberArg('concurrency') ?? DEFAULT_CONCURRENCY,
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

function buildDerivativeStorageKey(
  sourceKey: string,
  variant: 'thumbnail' | 'preview',
): string {
  const slashIndex = sourceKey.lastIndexOf('/')
  const directory = slashIndex >= 0 ? sourceKey.slice(0, slashIndex + 1) : ''
  const filename = slashIndex >= 0 ? sourceKey.slice(slashIndex + 1) : sourceKey
  const basename = filename.replace(/\.[^.]+$/, '') || filename
  return `${directory}${basename}.${variant}.webp`
}

function publicUrlForKey(key: string): string {
  return `${requireEnv('NEXT_PUBLIC_STORAGE_BASE_URL').replace(/\/$/, '')}/${key}`
}

async function fetchImageBuffer(url: string): Promise<Buffer> {
  const parsed = new URL(url)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported URL protocol: ${parsed.protocol}`)
  }

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch source image (${response.status})`)
  }

  return Buffer.from(await response.arrayBuffer())
}

async function makeWebpDerivative(
  sourceBuffer: Buffer,
  maxSize: number,
  quality: number,
): Promise<Buffer> {
  return sharp(sourceBuffer, { animated: false })
    .rotate()
    .resize({
      width: maxSize,
      height: maxSize,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality, effort: 4 })
    .toBuffer()
}

async function uploadObject(params: {
  r2: S3Client
  key: string
  body: Buffer
}): Promise<void> {
  await params.r2.send(
    new PutObjectCommand({
      Bucket: requireEnv('R2_BUCKET_NAME'),
      Key: params.key,
      Body: params.body,
      ContentType: WEBP_MIME_TYPE,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  )
}

async function createDerivatives(params: {
  r2: S3Client
  generation: BackfillGeneration
}): Promise<DerivativeAssets> {
  const sourceBuffer = await fetchImageBuffer(params.generation.url)
  const thumbnailStorageKey = buildDerivativeStorageKey(
    params.generation.storageKey,
    'thumbnail',
  )
  const previewStorageKey = buildDerivativeStorageKey(
    params.generation.storageKey,
    'preview',
  )

  const [thumbnailBuffer, previewBuffer] = await Promise.all([
    makeWebpDerivative(sourceBuffer, THUMBNAIL_MAX_SIZE, 78),
    makeWebpDerivative(sourceBuffer, PREVIEW_MAX_SIZE, 82),
  ])

  await Promise.all([
    uploadObject({
      r2: params.r2,
      key: thumbnailStorageKey,
      body: thumbnailBuffer,
    }),
    uploadObject({
      r2: params.r2,
      key: previewStorageKey,
      body: previewBuffer,
    }),
  ])

  return {
    thumbnailUrl: publicUrlForKey(thumbnailStorageKey),
    thumbnailStorageKey,
    previewUrl: publicUrlForKey(previewStorageKey),
    previewStorageKey,
  }
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (cursor < items.length) {
        const item = items[cursor]
        cursor += 1
        await worker(item)
      }
    },
  )
  await Promise.all(runners)
}

async function main() {
  const options = readCliOptions()
  const adapter = new PrismaPg({ connectionString: requireEnv('DATABASE_URL') })
  const prisma = new PrismaClient({ adapter })
  const r2 = new S3Client({
    endpoint: `https://${requireEnv('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
    region: 'auto',
    credentials: {
      accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
    },
  })

  let processed = 0
  let updated = 0
  let skipped = 0
  let failed = 0
  let cursorId: string | undefined

  console.log(
    [
      '',
      'Generation preview backfill',
      options.dryRun ? 'Mode: dry-run' : 'Mode: live',
      `Batch size: ${options.batchSize}`,
      `Concurrency: ${options.concurrency}`,
      options.force ? 'Force: yes' : 'Force: no',
      options.limit ? `Limit: ${options.limit}` : 'Limit: none',
      '',
    ].join('\n'),
  )

  try {
    const columns = await prisma.$queryRaw<
      Array<{ column_name: string }>
    >`SELECT column_name FROM information_schema.columns WHERE table_name = 'Generation' AND column_name IN ('thumbnailUrl', 'thumbnailStorageKey', 'previewUrl', 'previewStorageKey')`
    const existingColumns = new Set(columns.map((column) => column.column_name))
    const missingColumns = REQUIRED_GENERATION_COLUMNS.filter(
      (column) => !existingColumns.has(column),
    )
    if (missingColumns.length > 0) {
      throw new Error(
        `Generation preview columns are missing (${missingColumns.join(', ')}). Apply prisma/migrations/20260515194000_add_generation_image_previews before running this backfill.`,
      )
    }

    while (!options.limit || processed < options.limit) {
      const remaining = options.limit
        ? Math.max(options.limit - processed, 0)
        : options.batchSize
      if (remaining === 0) break

      const generations = await prisma.generation.findMany({
        where: {
          outputType: 'IMAGE',
          ...(options.force
            ? {}
            : {
                OR: [{ thumbnailUrl: null }, { previewUrl: null }],
              }),
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        take: Math.min(options.batchSize, remaining),
        select: {
          id: true,
          url: true,
          storageKey: true,
          mimeType: true,
          thumbnailUrl: true,
          previewUrl: true,
        },
      })

      if (generations.length === 0) break
      cursorId = generations.at(-1)?.id

      await runPool(
        generations,
        options.concurrency,
        async (generation: BackfillGeneration) => {
          processed += 1
          if (!generation.mimeType.startsWith('image/')) {
            skipped += 1
            console.log(
              `skip ${generation.id}: unsupported mimeType ${generation.mimeType}`,
            )
            return
          }

          if (options.dryRun) {
            updated += 1
            console.log(`dry-run ${generation.id}: ${generation.url}`)
            return
          }

          try {
            const derivatives = await createDerivatives({ r2, generation })
            await prisma.generation.update({
              where: { id: generation.id },
              data: derivatives,
            })
            updated += 1
            console.log(`updated ${generation.id}`)
          } catch (error) {
            failed += 1
            console.error(
              `failed ${generation.id}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            )
          }
        },
      )
    }

    console.log(
      [
        '',
        'Backfill summary',
        `Processed: ${processed}`,
        options.dryRun ? `Would update: ${updated}` : `Updated: ${updated}`,
        `Skipped: ${skipped}`,
        `Failed: ${failed}`,
        '',
      ].join('\n'),
    )

    if (failed > 0) process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error('Backfill failed:', error)
  process.exit(1)
})
