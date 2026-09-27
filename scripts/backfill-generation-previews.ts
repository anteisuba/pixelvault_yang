/**
 * 一次性清队列：跑完 `IMAGE_PREVIEW_DERIVATIVES` outbox 里积压的缩略图 / 预览图任务。
 *
 * Usage:
 *   npx tsx --conditions=react-server --tsconfig tsconfig.json \
 *     scripts/backfill-generation-previews.ts                    # 默认只出报告，不写库
 *   npx tsx --conditions=react-server --tsconfig tsconfig.json \
 *     scripts/backfill-generation-previews.ts --apply --limit 5  # ⚠ 每次都要 owner 当次授权
 *
 * ⚠ `--conditions=react-server` 不是装饰：处理函数和 `r2.ts` 顶着
 * `import 'server-only'`，默认条件下加载即抛。
 *
 * ── 为什么会积压 ────────────────────────────────────────────────────────
 * 2026-06-03 图片迁到 execution worker 后，回调只入队不处理，唯一的消费者是每日
 * sweep cron（每次 5 条）。09-28 起回调在响应之后立刻处理自己那一条；本脚本只清
 * 存量，在那次修复部署之后跑。
 *
 * ⛔ 生成本体是 `processImagePreviewDerivativeOutbox`，与回调、cron 同一条路径，
 * 脚本不许自己再写一份 sharp / 上传。旧版脚本就是另写的一份：缩略图还是 384px，
 * 按「缺任一列」筛还会把上传图（按设计只有缩略图）同名覆盖成小图。
 *
 * 只动队列里的行：上传图不入队，不会被碰。图已删的行由处理函数标 FAILED，不读写
 * R2。重跑安全：处理函数先看两列是否已有值；认领是 CAS，和 cron / 回调同时跑也
 * 不会重复处理。
 */

import { EXECUTION_OUTBOX_KINDS } from '@/constants/execution'
import type { ImagePreviewDerivativeProcessResult } from '@/services/image/image-preview-derivative.service'

const PROCESS_BATCH_SIZE = 5

/* ── CLI 解析（纯函数，可测）──────────────────────────────────────────── */

export interface CliOptions {
  readonly apply: boolean
  readonly limit?: number
}

/** ⛔ 认不出来的参数一律抛：一次性回填脚本上「悄悄忽略拼错的 flag」代价太高。 */
export function parseCliArgs(argv: readonly string[]): CliOptions {
  let apply = false
  let limit: number | undefined
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string
    if (arg === '--apply') {
      apply = true
    } else if (arg === '--dry-run') {
      apply = false
    } else if (arg === '--limit' || arg.startsWith('--limit=')) {
      const raw =
        arg === '--limit' ? argv[(index += 1)] : arg.slice('--limit='.length)
      const parsed = Number(raw)
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`[backfill-previews] --limit 必须是正整数，收到 ${raw}`)
      }
      limit = parsed
    } else {
      throw new Error(`[backfill-previews] 认不出的参数：${arg}`)
    }
  }
  return limit === undefined ? { apply } : { apply, limit }
}

/* ── 汇总（纯函数，可测）──────────────────────────────────────────────── */

export interface BackfillSummary {
  readonly generated: number
  readonly imageDeleted: number
  readonly failed: number
  readonly retrying: number
  readonly skipped: number
}

/**
 * 每条 outbox 只按最后一次结果记账：`retrying` 会在下一批被再认领，只是中间态。
 * FAILED 再按图还在不在分开——图已删是预期的收尾，图还在的失败才要人看。
 */
export function summarizeResults(
  results: readonly ImagePreviewDerivativeProcessResult[],
  existingGenerationIds: ReadonlySet<string>,
): BackfillSummary {
  const lastByOutbox = new Map<string, ImagePreviewDerivativeProcessResult>()
  for (const result of results) lastByOutbox.set(result.outboxId, result)

  const summary = {
    generated: 0,
    imageDeleted: 0,
    failed: 0,
    retrying: 0,
    skipped: 0,
  }
  for (const result of lastByOutbox.values()) {
    if (result.status === 'completed') {
      summary.generated += 1
    } else if (result.status === 'retrying') {
      summary.retrying += 1
    } else if (result.status === 'failed') {
      if (
        result.generationId &&
        !existingGenerationIds.has(result.generationId)
      ) {
        summary.imageDeleted += 1
      } else {
        summary.failed += 1
      }
    } else {
      summary.skipped += 1
    }
  }
  return summary
}

function readGenerationId(payload: unknown): string | null {
  return typeof payload === 'object' &&
    payload !== null &&
    'generationId' in payload &&
    typeof payload.generationId === 'string'
    ? payload.generationId
    : null
}

function formatResultLine(result: ImagePreviewDerivativeProcessResult): string {
  const generation = result.generationId
    ? ` generation=${result.generationId}`
    : ''
  const error = result.error ? ` error=${result.error}` : ''
  return `[backfill-previews] ${result.status} outbox=${result.outboxId}${generation}${error}`
}

/* ── 真跑 ───────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2))

  const dotenv = await import('dotenv')
  dotenv.config({ path: '.env.local' })
  const { db } = await import('@/lib/db')

  // 写到哪：库主机与预览图 URL 前缀，--apply 之前先对一眼。
  console.log(`[backfill-previews] MODE ${options.apply ? 'apply' : 'report'}`)
  console.log(
    `[backfill-previews] DB ${new URL(process.env.DATABASE_URL ?? '').host} · 预览图前缀 ${process.env.NEXT_PUBLIC_STORAGE_BASE_URL}`,
  )

  const queued = await db.executionOutbox.findMany({
    where: {
      kind: EXECUTION_OUTBOX_KINDS.IMAGE_PREVIEW_DERIVATIVES,
      OR: [
        { status: 'PENDING' },
        { status: 'PROCESSING', leaseExpiresAt: { lt: new Date() } },
      ],
    },
    select: { payload: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  const queuedGenerationIds = queued
    .map((row) => readGenerationId(row.payload))
    .filter((id): id is string => id !== null)
  const alive = await db.generation.count({
    where: { id: { in: queuedGenerationIds }, outputType: 'IMAGE' },
  })
  console.log(
    `[backfill-previews] QUEUED ${queued.length} · 图还在 ${alive} · 图已删 ${queued.length - alive}`,
  )
  const [oldest, newest] = [queued[0], queued.at(-1)]
  if (oldest && newest) {
    console.log(
      `[backfill-previews] 最早 ${oldest.createdAt.toISOString()} · 最新 ${newest.createdAt.toISOString()}`,
    )
  }

  if (!options.apply) {
    await db.$disconnect()
    return
  }

  const { processPendingImagePreviewDerivativeOutboxes } =
    await import('@/services/image/image-preview-derivative.service')
  const limit = options.limit ?? Number.POSITIVE_INFINITY
  const results: ImagePreviewDerivativeProcessResult[] = []
  while (results.length < limit) {
    const batch = await processPendingImagePreviewDerivativeOutboxes({
      limit: Math.min(PROCESS_BATCH_SIZE, limit - results.length),
    })
    if (batch.length === 0) break
    for (const result of batch) {
      results.push(result)
      console.log(formatResultLine(result))
    }
  }

  const failedGenerationIds = results
    .filter((result) => result.status === 'failed' && result.generationId)
    .map((result) => result.generationId as string)
  const existing = await db.generation.findMany({
    where: { id: { in: failedGenerationIds } },
    select: { id: true },
  })
  const summary = summarizeResults(
    results,
    new Set(existing.map((row) => row.id)),
  )
  console.log(
    `\n[backfill-previews] SUMMARY 生成 ${summary.generated} · 图已删 ${summary.imageDeleted} · 失败 ${summary.failed} · 还在重试 ${summary.retrying} · 跳过 ${summary.skipped}`,
  )
  if (summary.failed > 0) process.exitCode = 1
  await db.$disconnect()
}

// tsx 直跑时才执行；被单测 import 时不跑。
if (process.argv[1]?.endsWith('backfill-generation-previews.ts')) {
  void main()
}
