/**
 * L4 端到端用的**假 Worker**（docs/references/testing.md「测试标准」）：只替掉边界——
 * Cloudflare 上的执行 Worker 和它背后的服务商。应用这一侧（派发签名、取 key、结果回调写库、
 * 库页显示）全是真代码。
 *
 * 签名、取 key、回调直接用**真 Worker 的那座桥**（`workers/execution/src/lib/app-bridge.ts`），
 * 协议改了这里跟着红，不会和真 Worker 分叉。
 *
 * 行为：收到派发 → 验签 → 回 `workflowInstanceId` → 照真 Worker 的顺序向应用取 key →
 * 回调一张「已经传好」的图（`imageR2Key`，应用不再去 R2 上传）。图本身由这里的
 * `/artifact/*.png` 提供，库页能真的显示出来。
 *
 * 跑法（Node 22，不用装 tsx）：
 *   INTERNAL_CALLBACK_SECRET=... node --experimental-strip-types e2e/fake-worker/server.ts
 */
import { createServer } from 'node:http'

import {
  emitRunResultCallback,
  resolveRunApiKey,
  verifySignedBody,
} from '../../workers/execution/src/lib/app-bridge.ts'

const PORT = Number(process.env.FAKE_WORKER_PORT ?? 4010)
const SELF = `http://localhost:${PORT}`
const SECRET = process.env.INTERNAL_CALLBACK_SECRET
if (!SECRET) throw new Error('INTERNAL_CALLBACK_SECRET is required')
const env = { INTERNAL_CALLBACK_SECRET: SECRET }

/** 64×64 的纯色 PNG（库页要能真的显示一张图）。 */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAT0lEQVR42u3PQQkAAAgEsItjJrMbxgi+hcEKLNP1WgQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQELgteuuE8uE1jwAAAAABJRU5ErkJggg==',
  'base64',
)

interface RunContext {
  runId: string
  outputType: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'MODEL_3D'
  callbackUrl: string
  resolveKeyUrl: string
  providerId: string
  apiKeyId?: string | null
  useSystemKey?: boolean
}

/** 跑过的每一次运行（`GET /runs` 给测试核对：派发到了、key 取到了）。 */
const runs: Array<{ runId: string; outputType: string; apiKey: string }> = []

async function finish(context: RunContext): Promise<void> {
  try {
    const apiKey = await resolveRunApiKey(env, context)
    runs.push({ runId: context.runId, outputType: context.outputType, apiKey })
    await emitRunResultCallback(env, context, {
      artifactUrl: `${SELF}/artifact/${context.runId}.png`,
      imageR2Key: `e2e/${context.runId}.png`,
      width: 64,
      height: 64,
      mimeType: 'image/png',
    })
  } catch (error) {
    console.error(`[fake-worker] run ${context.runId} failed`, error)
  }
}

const server = createServer(async (incoming, outgoing) => {
  const url = new URL(incoming.url ?? '/', SELF)
  const reply = (status: number, body: unknown, type = 'application/json') => {
    outgoing.writeHead(status, { 'Content-Type': type })
    outgoing.end(type === 'application/json' ? JSON.stringify(body) : body)
  }

  if (incoming.method === 'GET' && url.pathname.startsWith('/artifact/'))
    return reply(200, PNG, 'image/png')
  if (incoming.method === 'GET' && url.pathname === '/runs')
    return reply(200, runs)
  if (incoming.method === 'GET' && url.pathname === '/health')
    return reply(200, { ok: true })

  const chunks: Buffer[] = []
  for await (const chunk of incoming) chunks.push(chunk as Buffer)
  const request = new Request(url, {
    method: incoming.method,
    headers: incoming.headers as Record<string, string>,
    body: Buffer.concat(chunks),
  })
  const body = await verifySignedBody(request, SECRET)
  if (!body) return reply(401, { ok: false, error: 'Invalid signature.' })

  if (url.pathname === '/cancel') return reply(200, { ok: true })
  if (url.pathname.startsWith('/workflows/')) {
    const context = JSON.parse(body) as RunContext
    // 先回派发结果、再在后台跑完——和真 Worker 一样，回调可能比派发响应先到也得扛住。
    setTimeout(() => void finish(context), 300)
    return reply(200, { workflowInstanceId: `fake-${context.runId}` })
  }
  return reply(404, { ok: false, error: `no route ${url.pathname}` })
})

server.listen(PORT, () => console.log(`[fake-worker] listening on ${SELF}`))
