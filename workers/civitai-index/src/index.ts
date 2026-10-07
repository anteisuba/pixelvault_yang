import {
  WorkflowEntrypoint,
  type Workflow,
  type WorkflowEvent,
  type WorkflowStep,
  type WorkflowStepConfig,
} from 'cloudflare:workers'

import { SearchInputSchema, searchIndex } from './search'
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
}

type SyncParams = Record<string, never>

/** 一轮最多走多少个 step（每步 5 千条）——两百万条的余量，防死循环。 */
const MAX_SYNC_STEPS = 400

const SYNC_STEP_CONFIG: WorkflowStepConfig = {
  retries: { limit: 5, delay: '1 minute', backoff: 'exponential' },
  timeout: '15 minutes',
}

function json(body: unknown, status = 200, startedAt?: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...(startedAt === undefined
        ? {}
        : { 'Server-Timing': `index;dur=${Date.now() - startedAt}` }),
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

async function startSync(env: Env, id: string): Promise<string> {
  const instance = await env.SYNC_WORKFLOW.create({ id, params: {} })
  return instance.id
}

const civitaiIndexWorker = {
  async fetch(request: Request, env: Env): Promise<Response> {
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
      return json(await searchIndex(env.DB, parsed.data), 200, startedAt)
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

    return json({ error: 'Not found' }, 404)
  },

  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
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
    return { ...totals, rowCount }
  }
}
