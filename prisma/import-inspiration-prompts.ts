/**
 * Import curated prompts from MeiGen-AI-Design's trending-prompts dataset
 * into the InspirationPrompt table.
 *
 * The script is idempotent — each row is upserted by its source id, so
 * re-running picks up new entries and refreshes counters without
 * duplicating data.
 *
 * Usage:
 *   npx tsx prisma/import-inspiration-prompts.ts                 # 50 sample
 *   npx tsx prisma/import-inspiration-prompts.ts --limit 1446    # full
 *   npx tsx prisma/import-inspiration-prompts.ts --limit 0       # full (alias)
 *   npx tsx prisma/import-inspiration-prompts.ts --dry-run       # preview
 *   npx tsx prisma/import-inspiration-prompts.ts --source ./local.json
 *
 * Default source:
 *   https://raw.githubusercontent.com/jau123/MeiGen-AI-Design-MCP/main/data/trending-prompts.json
 *
 * Prerequisite: migration 20260527151701_add_inspiration_prompt must have
 * been applied (`npx prisma migrate dev`).
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { PrismaPg } from '@prisma/adapter-pg'
import * as dotenv from 'dotenv'
import { z } from 'zod'

import { PrismaClient } from '../src/lib/generated/prisma/client'

dotenv.config({ path: '.env.local' })

const DEFAULT_SOURCE_URL =
  'https://raw.githubusercontent.com/jau123/MeiGen-AI-Design-MCP/main/data/trending-prompts.json'

const DEFAULT_LIMIT = 50
const SOURCE_TAG = 'meigen'

// ─── Zod schema mirroring the upstream JSON shape ───────────────

const TrendingPromptSchema = z.object({
  rank: z.number().int(),
  id: z.union([z.string(), z.number()]).transform((v) => String(v)),
  prompt: z.string().min(1),
  author: z.string(),
  author_name: z.string(),
  likes: z.number().int().nonnegative().default(0),
  views: z.number().int().nonnegative().default(0),
  image: z.string().min(1),
  images: z.array(z.string()).optional(),
  model: z.string().optional(),
  categories: z.array(z.string()).default([]),
  rating: z.number().optional(),
  score: z.number().optional(),
  date: z.string().optional(),
  source_url: z.string(),
})

type TrendingPrompt = z.infer<typeof TrendingPromptSchema>

// ─── CLI argv parsing (no extra deps) ───────────────────────────

interface CliArgs {
  limit: number // 0 means "import all"
  source: string
  dryRun: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    limit: DEFAULT_LIMIT,
    source: DEFAULT_SOURCE_URL,
    dryRun: false,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run') {
      args.dryRun = true
      continue
    }
    if (arg === '--limit') {
      const next = argv[i + 1]
      if (!next) throw new Error('--limit requires a numeric value')
      const n = Number.parseInt(next, 10)
      if (!Number.isFinite(n) || n < 0) {
        throw new Error(`--limit must be a non-negative integer, got "${next}"`)
      }
      args.limit = n
      i++
      continue
    }
    if (arg === '--source') {
      const next = argv[i + 1]
      if (!next) throw new Error('--source requires a URL or file path')
      args.source = next
      i++
      continue
    }
    if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    }
  }

  return args
}

function printHelp(): void {
  process.stdout.write(`Import curated prompts into InspirationPrompt.

Options:
  --limit N        Import only the first N rows (default ${DEFAULT_LIMIT}, 0 = all)
  --source URL     URL or local file path to the JSON dataset
                   (default: MeiGen-AI-Design GitHub raw)
  --dry-run        Parse + validate, but do not write to DB
  -h, --help       Show this help

Examples:
  npx tsx prisma/import-inspiration-prompts.ts
  npx tsx prisma/import-inspiration-prompts.ts --limit 0
  npx tsx prisma/import-inspiration-prompts.ts --source ./trending.json --dry-run
`)
}

// ─── Data loading ───────────────────────────────────────────────

async function loadDataset(source: string): Promise<unknown> {
  if (source.startsWith('http://') || source.startsWith('https://')) {
    process.stdout.write(`→ Fetching ${source}\n`)
    const res = await fetch(source)
    if (!res.ok) {
      throw new Error(
        `Failed to fetch dataset: ${res.status} ${res.statusText}`,
      )
    }
    return res.json()
  }

  const path = resolve(source)
  process.stdout.write(`→ Reading ${path}\n`)
  return JSON.parse(readFileSync(path, 'utf-8'))
}

// ─── Row → DB mapping ───────────────────────────────────────────

function toDbRow(p: TrendingPrompt) {
  const publishedAt = p.date ? new Date(p.date) : null
  const safePublishedAt =
    publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null

  return {
    id: p.id,
    source: SOURCE_TAG,
    rank: p.rank,
    prompt: p.prompt,
    author: p.author,
    authorName: p.author_name,
    likes: p.likes,
    views: p.views,
    imageUrl: p.image,
    modelHint: p.model ?? null,
    categories: p.categories,
    sourceUrl: p.source_url,
    rating: p.rating ?? null,
    score: p.score ?? null,
    publishedAt: safePublishedAt,
  }
}

// ─── Main ───────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  process.stdout.write(
    `Inspiration import — limit=${args.limit === 0 ? 'all' : args.limit}, dryRun=${args.dryRun}\n`,
  )

  const raw = await loadDataset(args.source)
  if (!Array.isArray(raw)) {
    throw new Error('Dataset root must be an array of prompts')
  }

  const cap = args.limit === 0 ? raw.length : args.limit
  const slice = raw.slice(0, cap)

  // Validate everything up front so we know how many rows survive
  const valid: TrendingPrompt[] = []
  let invalid = 0
  for (const entry of slice) {
    const parsed = TrendingPromptSchema.safeParse(entry)
    if (parsed.success) {
      valid.push(parsed.data)
    } else {
      invalid++
      const id =
        (entry as { id?: unknown })?.id != null
          ? String((entry as { id: unknown }).id)
          : '<unknown>'
      process.stderr.write(
        `! Skipping invalid row id=${id}: ${parsed.error.issues
          .slice(0, 2)
          .map((i) => `${i.path.join('.')}=${i.message}`)
          .join(', ')}\n`,
      )
    }
  }

  process.stdout.write(
    `Parsed ${valid.length} valid rows (${invalid} skipped) out of ${slice.length} attempted.\n`,
  )

  if (args.dryRun) {
    process.stdout.write('Dry-run mode — no DB writes.\n')
    const sample = valid.slice(0, 3).map((p) => ({
      id: p.id,
      rank: p.rank,
      categories: p.categories,
      authorName: p.author_name,
    }))
    process.stdout.write(`Sample:\n${JSON.stringify(sample, null, 2)}\n`)
    return
  }

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set — check .env.local')
  }

  const adapter = new PrismaPg({ connectionString })
  const db = new PrismaClient({ adapter })

  try {
    let upserted = 0
    let failed = 0
    for (const row of valid) {
      const data = toDbRow(row)
      try {
        await db.inspirationPrompt.upsert({
          where: { id: data.id },
          create: data,
          update: {
            // refresh mutable fields on re-import; preserve created_at
            rank: data.rank,
            prompt: data.prompt,
            likes: data.likes,
            views: data.views,
            imageUrl: data.imageUrl,
            modelHint: data.modelHint,
            categories: data.categories,
            rating: data.rating,
            score: data.score,
            publishedAt: data.publishedAt,
            author: data.author,
            authorName: data.authorName,
            sourceUrl: data.sourceUrl,
          },
        })
        upserted++
      } catch (err) {
        failed++
        process.stderr.write(
          `! Upsert failed for id=${data.id}: ${err instanceof Error ? err.message : String(err)}\n`,
        )
      }
    }

    process.stdout.write(
      `Done. Upserted ${upserted}, failed ${failed}, skipped ${invalid}.\n`,
    )
  } finally {
    await db.$disconnect()
  }
}

main().catch((err) => {
  process.stderr.write(
    `Import failed: ${err instanceof Error ? err.message : String(err)}\n`,
  )
  process.exit(1)
})
