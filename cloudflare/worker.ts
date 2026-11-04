/**
 * 网站 Worker 的入口：OpenNext 生成的 `.open-next/worker.js` 负责所有网页请求，
 * 这里只多接一个定时触发（原来 vercel.json 的 cron）。
 */
import * as Sentry from '@sentry/cloudflare'

// `.open-next/worker.js` 由 `opennextjs-cloudflare build` 生成（根 tsconfig 不检查本目录）。
import openNext from '../.open-next/worker.js'

export { DOQueueHandler, DOShardedTagCache } from '../.open-next/worker.js'

/** 每天 12:00 UTC 扫一遍卡住的生成、补缺的小图、清过期的助手记录（与原 Vercel cron 同一条路由）。 */
const SWEEP_PATH = '/api/internal/execution/sweep'

interface WorkerEnv extends CloudflareEnv {
  CRON_SECRET?: string
  NEXT_PUBLIC_APP_URL?: string
  NEXT_PUBLIC_SENTRY_DSN?: string
}

interface OpenNextWorker {
  fetch(
    request: Request,
    env: WorkerEnv,
    ctx: ExecutionContext,
  ): Promise<Response>
}

const worker = openNext as OpenNextWorker

const handler = {
  fetch: worker.fetch,

  async scheduled(
    _controller: ScheduledController,
    env: WorkerEnv,
    ctx: ExecutionContext,
  ): Promise<void> {
    if (!env.CRON_SECRET) {
      console.error('[cron] CRON_SECRET is not configured; sweep skipped')
      return
    }
    const origin = env.NEXT_PUBLIC_APP_URL ?? 'https://www.anteisuba.com'
    const response = await worker.fetch(
      new Request(new URL(SWEEP_PATH, origin), {
        headers: { authorization: `Bearer ${env.CRON_SECRET}` },
      }),
      env,
      ctx,
    )
    if (!response.ok) {
      console.error(
        `[cron] sweep failed: ${response.status} ${await response.text()}`,
      )
    }
  },
}

/** 服务端报错上报（原来 sentry.server.config.ts 的设置：只上报生产、10% 性能采样）。 */
export default Sentry.withSentry(
  (env: WorkerEnv) => ({
    dsn: env.NEXT_PUBLIC_SENTRY_DSN,
    enabled: Boolean(env.NEXT_PUBLIC_SENTRY_DSN),
    tracesSampleRate: 0.1,
  }),
  handler satisfies ExportedHandler<WorkerEnv>,
)
