/**
 * Health-check the imageUrl on every InspirationPrompt row.
 *
 * Phase 1 of the inspiration library hot-links thumbnails from
 * `images.meigen.ai`. The upstream host occasionally goes down or moves
 * URLs, leaving us with broken previews. This script does HEAD requests
 * (no body download) and reports which rows are broken.
 *
 * Optionally pass `--hide` to flip `isPublic = false` on broken rows so
 * they stop showing up in the public list. Without `--hide` the script
 * is purely read-only — it prints a report.
 *
 * Usage:
 *   npx tsx prisma/check-inspiration-images.ts                    # report only
 *   npx tsx prisma/check-inspiration-images.ts --hide             # auto-hide broken rows
 *   npx tsx prisma/check-inspiration-images.ts --concurrency 16   # parallelism (default 8)
 *   npx tsx prisma/check-inspiration-images.ts --timeout 5000     # per-request ms (default 7000)
 */

import { PrismaPg } from '@prisma/adapter-pg'
import * as dotenv from 'dotenv'

import { PrismaClient } from '../src/lib/generated/prisma/client'

dotenv.config({ path: '.env.local' })

interface CliArgs {
  hide: boolean
  concurrency: number
  timeoutMs: number
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { hide: false, concurrency: 8, timeoutMs: 7000 }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--hide') {
      args.hide = true
      continue
    }
    if (arg === '--concurrency') {
      const next = argv[i + 1]
      const n = Number.parseInt(next ?? '', 10)
      if (!Number.isFinite(n) || n < 1) {
        throw new Error('--concurrency must be a positive integer')
      }
      args.concurrency = Math.min(n, 32)
      i++
      continue
    }
    if (arg === '--timeout') {
      const next = argv[i + 1]
      const n = Number.parseInt(next ?? '', 10)
      if (!Number.isFinite(n) || n < 500) {
        throw new Error('--timeout must be >= 500 (milliseconds)')
      }
      args.timeoutMs = n
      i++
      continue
    }
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(`Health-check InspirationPrompt thumbnails.

Options:
  --hide                 Auto-set isPublic=false on broken rows
  --concurrency N        Parallel HEAD requests (default 8, max 32)
  --timeout MS           Per-request timeout (default 7000)
  -h, --help             Show this help
`)
      process.exit(0)
    }
  }

  return args
}

interface CheckResult {
  id: string
  imageUrl: string
  ok: boolean
  status: number | null
  reason: string | null
}

async function checkOne(
  row: { id: string; imageUrl: string },
  timeoutMs: number,
): Promise<CheckResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(row.imageUrl, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    })
    // Some CDNs reject HEAD with 405 but the GET would succeed — retry
    // once with a 1-byte ranged GET so we don't flag those as broken.
    if (res.status === 405) {
      const getRes = await fetch(row.imageUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: { Range: 'bytes=0-0' },
        redirect: 'follow',
      })
      return {
        id: row.id,
        imageUrl: row.imageUrl,
        ok: getRes.ok || getRes.status === 206,
        status: getRes.status,
        reason: getRes.ok ? null : `HTTP ${getRes.status}`,
      }
    }
    return {
      id: row.id,
      imageUrl: row.imageUrl,
      ok: res.ok,
      status: res.status,
      reason: res.ok ? null : `HTTP ${res.status}`,
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    return {
      id: row.id,
      imageUrl: row.imageUrl,
      ok: false,
      status: null,
      reason,
    }
  } finally {
    clearTimeout(timer)
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  concurrency: number,
  onProgress?: (done: number, total: number) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  let completed = 0
  const total = items.length

  async function pump(): Promise<void> {
    while (true) {
      const i = nextIndex++
      if (i >= total) return
      results[i] = await worker(items[i])
      completed++
      onProgress?.(completed, total)
    }
  }

  const pumps = Array.from({ length: Math.min(concurrency, total) }, () =>
    pump(),
  )
  await Promise.all(pumps)
  return results
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set — check .env.local')
  }

  const adapter = new PrismaPg({ connectionString })
  const db = new PrismaClient({ adapter })

  try {
    const rows = await db.inspirationPrompt.findMany({
      where: { isPublic: true },
      select: { id: true, imageUrl: true },
      orderBy: { rank: 'asc' },
    })

    process.stdout.write(
      `Checking ${rows.length} public inspirations (concurrency=${args.concurrency}, timeout=${args.timeoutMs}ms)...\n`,
    )

    let printedAt = 0
    const results = await runWithConcurrency(
      rows,
      (row) => checkOne(row, args.timeoutMs),
      args.concurrency,
      (done, total) => {
        // Print progress at most every 25 rows to keep output tidy
        if (done - printedAt >= 25 || done === total) {
          process.stdout.write(`  ${done}/${total}\n`)
          printedAt = done
        }
      },
    )

    const broken = results.filter((r) => !r.ok)
    const ok = results.length - broken.length
    const brokenPct =
      results.length === 0 ? 0 : (broken.length / results.length) * 100

    process.stdout.write(
      `\nResult: ${ok} ok, ${broken.length} broken (${brokenPct.toFixed(1)}%)\n`,
    )

    if (broken.length > 0) {
      process.stdout.write('\nBroken rows:\n')
      for (const r of broken.slice(0, 20)) {
        process.stdout.write(`  ${r.id}  ${r.reason}  ${r.imageUrl}\n`)
      }
      if (broken.length > 20) {
        process.stdout.write(`  ... and ${broken.length - 20} more\n`)
      }
    }

    if (args.hide && broken.length > 0) {
      const ids = broken.map((r) => r.id)
      const updated = await db.inspirationPrompt.updateMany({
        where: { id: { in: ids } },
        data: { isPublic: false },
      })
      process.stdout.write(
        `\nHidden ${updated.count} broken rows (isPublic=false).\n`,
      )
    } else if (broken.length > 0) {
      process.stdout.write(
        '\nRun again with --hide to auto-set isPublic=false on these rows.\n',
      )
    }
  } finally {
    await db.$disconnect()
  }
}

main().catch((err) => {
  process.stderr.write(
    `Health check failed: ${err instanceof Error ? err.message : String(err)}\n`,
  )
  process.exit(1)
})
