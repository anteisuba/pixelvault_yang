import {
  WorkflowEntrypoint,
  type Workflow,
  type WorkflowEvent,
  type WorkflowStep,
  type WorkflowStepConfig,
} from 'cloudflare:workers'

import { embedPending, type SemanticIndexBinding } from './meaning'
import {
  SearchInputSchema,
  searchIndex,
  warmBrowseCounts,
  type SearchTimings,
} from './search'
import {
  PAGES_PER_STEP,
  recordSyncCompleted,
  recordSyncError,
  syncPages,
  type SyncProgress,
} from './sync'
import { civitaiUpstream } from './upstream'

export interface Env {
  DB: D1Database
  SYNC_WORKFLOW: Workflow<SyncParams>
  /** wrangler secret；与 Vercel 的 CIVITAI_INDEX_TOKEN 同值 */
  INDEX_TOKEN: string
  /** semantic-index 的 SemanticIndex 入口（service binding），见 src/meaning.ts */
  SEMANTIC: SemanticIndexBinding
}

interface SyncParams {
  /** 只补算向量、不同步（首灌、或排查时） */
  embedOnly?: boolean
}

/** 一轮最多走多少个 step（每步 5 千条）——两百万条的余量，防死循环。 */
const MAX_SYNC_STEPS = 400
/** 算向量最多走多少个 step（每步 5 千行）：首灌 68 万行约 140 步。 */
const MAX_EMBED_STEPS = 300

const SYNC_STEP_CONFIG: WorkflowStepConfig = {
  retries: { limit: 5, delay: '1 minute', backoff: 'exponential' },
  timeout: '15 minutes',
}

/**
 * 慢于它的搜索在 Workers Logs 里留一行 `slow_search`（条件 + 各段耗时）。应用侧
 * 每次等 8 秒，这条线远低于它，变慢的苗头在超时之前就看得见。
 */
const SLOW_SEARCH_MS = 2000

/** 保温（与 wrangler.jsonc 的第二条 cron 同一串）：读一行，让 D1 别睡过去。 */
const KEEP_WARM_CRON = '*/3 * * * *'

function json(body: unknown, status = 200, serverTiming?: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...(serverTiming === undefined ? {} : { 'Server-Timing': serverTiming }),
    },
  })
}

function isAuthorized(request: Request, env: Env): boolean {
  const header = request.headers.get('Authorization') ?? ''
  const expected = `Bearer ${env.INDEX_TOKEN}`
  if (!env.INDEX_TOKEN || header.length !== expected.length) return false
  let diff = 0
  for (let index = 0; index < expected.length; index += 1) {
    diff |= header.charCodeAt(index) ^ expected.charCodeAt(index)
  }
  return diff === 0
}

async function startSync(
  env: Env,
  id: string,
  params: SyncParams = {},
): Promise<string> {
  const instance = await env.SYNC_WORKFLOW.create({ id, params })
  return instance.id
}

const civitaiIndexWorker = {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    if (!isAuthorized(request, env)) {
      return json({ error: 'Unauthorized' }, 401)
    }
    const { pathname } = new URL(request.url)

    if (request.method === 'POST' && pathname === '/search') {
      const parsed = SearchInputSchema.safeParse(
        await request.json().catch(() => null),
      )
      if (!parsed.success) {
        return json({ error: 'Invalid search input' }, 400)
      }
      const startedAt = Date.now()
      const timings: SearchTimings = { countMs: 0, pageMs: 0, meaningMs: 0 }
      const search = searchIndex(env.DB, parsed.data, {
        timings,
        semantic: env.SEMANTIC,
        defer: (work) => ctx.waitUntil(work.catch(() => undefined)),
      }).finally(() => {
        const totalMs = Date.now() - startedAt
        if (totalMs < SLOW_SEARCH_MS) return
        console.log(
          JSON.stringify({
            event: 'slow_search',
            totalMs,
            ...timings,
            input: parsed.data,
          }),
        )
      })
      // 应用侧超时断开后照样跑完、留下日志：最慢的那些正是要看的。
      ctx.waitUntil(search.catch(() => undefined))
      const result = await search
      return json(
        result,
        200,
        `index;dur=${Date.now() - startedAt}, count;dur=${timings.countMs}, page;dur=${timings.pageMs}, meaning;dur=${timings.meaningMs}`,
      )
    }

    if (request.method === 'GET' && pathname === '/status') {
      const state = await env.DB.prepare(
        'SELECT last_completed_at, last_error, row_count FROM sync_state WHERE id = 1',
      ).first()
      return json(state)
    }

    // 手动开一轮（首灌、或排查时不想等到明天）。
    if (request.method === 'POST' && pathname === '/sync') {
      return json({ id: await startSync(env, `manual-${Date.now()}`) })
    }

    // 只补算向量（首灌按意思搜、或换了拼文字的口径之后）。
    if (request.method === 'POST' && pathname === '/embed') {
      return json({
        id: await startSync(env, `embed-${Date.now()}`, { embedOnly: true }),
      })
    }

    return json({ error: 'Not found' }, 404)
  },

  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    if (controller.cron === KEEP_WARM_CRON) {
      ctx.waitUntil(
        env.DB.prepare('SELECT 1 FROM sync_state WHERE id = 1')
          .first()
          .catch(() => undefined),
      )
      return
    }
    const day = new Date(controller.scheduledTime).toISOString().slice(0, 10)
    // 同一天只开一轮：cron 重投时 id 撞车，create 抛错，吞掉即可。
    ctx.waitUntil(startSync(env, `daily-${day}`).catch(() => undefined))
  },
}

export default civitaiIndexWorker

export class CivitaiIndexSyncWorkflow extends WorkflowEntrypoint<
  Env,
  SyncParams
> {
  async run(event: WorkflowEvent<SyncParams>, step: WorkflowStep) {
    if (event.payload.embedOnly) return { embedded: await this.embedAll(step) }

    // 用实例创建时刻当这一轮写入的 refreshed_at：重放时值不变。
    const startedAt = event.timestamp.getTime()
    const totals: Omit<SyncProgress, 'cursor' | 'done'> = {
      scanned: 0,
      refreshed: 0,
      metricsUpdated: 0,
      deleted: 0,
      deletesSkipped: 0,
      unreadable: 0,
    }
    let cursor = 0
    let done = false

    try {
      for (let index = 0; !done; index += 1) {
        if (index >= MAX_SYNC_STEPS) {
          throw new Error(`Sync did not finish within ${MAX_SYNC_STEPS} steps`)
        }
        const progress = await step.do(`pages-${index}`, SYNC_STEP_CONFIG, () =>
          syncPages(
            this.env.DB,
            civitaiUpstream,
            cursor,
            PAGES_PER_STEP,
            startedAt,
          ),
        )
        cursor = progress.cursor
        done = progress.done
        for (const key of Object.keys(totals) as (keyof typeof totals)[]) {
          totals[key] += progress[key]
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown'
      await step.do('record-error', () => recordSyncError(this.env.DB, message))
      throw error
    }

    const rowCount = await step.do('complete', () =>
      recordSyncCompleted(this.env.DB, Date.now()),
    )
    // 失败不算这一轮失败：数据已经同步完，没热到的组合由搜索时的后台重数兜住。
    const warmedCounts = await step
      .do('warm-counts', SYNC_STEP_CONFIG, () => warmBrowseCounts(this.env.DB))
      .catch(() => 0)
    // 同上：没算完的行明天这一轮接着算，期间只是按意思搜不到它们。
    const embedded = await this.embedAll(step).catch(() => -1)
    return { ...totals, rowCount, warmedCounts, embedded }
  }

  /** 把今天新出现 / 变过的行算成向量，直到没有剩下的。返回算了几行。 */
  private async embedAll(step: WorkflowStep): Promise<number> {
    let embedded = 0
    for (let index = 0; index < MAX_EMBED_STEPS; index += 1) {
      const progress = await step.do(`embed-${index}`, SYNC_STEP_CONFIG, () =>
        embedPending(this.env.DB, this.env.SEMANTIC),
      )
      embedded += progress.embedded
      if (progress.done) return embedded
    }
    throw new Error(`Embedding did not finish within ${MAX_EMBED_STEPS} steps`)
  }
}
