/**
 * L2a 真库：出图提交（/api/generate）。只假边界：Clerk 登录、限流、执行 Worker（fetch）。
 * 选路、建任务、派发 outbox、签名全真：核库里的任务行、发给 Worker 的东西与返回值。
 * ⛔ 明文 key 不许出现在派发给 Worker 的请求里（Worker 拿 apiKeyId 回头来取）。
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

vi.mock('server-only', () => ({}))

import {
  createPOST,
  mockAuthenticated,
  mockRateLimitAllowed,
  mockRateLimitExceeded,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'
import { EXECUTION_WORKER } from '@/constants/execution'
import { AI_MODELS } from '@/constants/models/enum'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { POST } from '@/app/api/generate/route'
import { db } from '@/lib/db'
import { createTestUser, resetDatabase, seedAssistantKey } from '@/test/int/db'

type Envelope<T> = { success: boolean; data?: T; errorCode?: string }

const WORKER = 'https://worker.test'

const worker = vi.hoisted(() => ({
  status: 200,
  requests: [] as Array<{ url: string; body: string; headers: Headers }>,
}))

beforeAll(() => {
  vi.stubEnv('EXECUTION_WORKER_BASE_URL', WORKER)
  vi.stubEnv('INTERNAL_CALLBACK_SECRET', 'test-internal-secret-not-real')
})
afterAll(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
  mockAuthenticated(me.clerkId)
  mockRateLimitAllowed()
  worker.status = 200
  worker.requests = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input)
      if (!url.startsWith(WORKER)) return new Response('nope', { status: 404 })
      worker.requests.push({
        url,
        body: String(init?.body ?? ''),
        headers: new Headers(init?.headers),
      })
      return worker.status === 200
        ? Response.json({ workflowInstanceId: 'wf_1' })
        : new Response('rejected', { status: worker.status })
    }),
  )
})

async function generate(body: Record<string, unknown>) {
  const res = await POST(
    createPOST('/api/generate', {
      prompt: 'a lighthouse at dusk',
      modelId: AI_MODELS.OPENAI_GPT_IMAGE_2,
      aspectRatio: '1:1',
      ...body,
    }),
  )
  return {
    status: res.status,
    body: await parseJSON<Envelope<{ jobId: string; requestId: string }>>(res),
  }
}

describe('POST /api/generate（真库，假 Worker）', () => {
  it('建任务、签名派发给 Worker（带 key id 不带明文），回任务号', async () => {
    const key = await seedAssistantKey(me.id, AI_ADAPTER_TYPES.OPENAI)
    const res = await generate({ apiKeyId: key.id })
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ requestId: 'wf_1' })

    const job = await db.generationJob.findUniqueOrThrow({
      where: { id: res.body.data!.jobId },
    })
    expect(job).toMatchObject({
      userId: me.id,
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      modelId: AI_MODELS.OPENAI_GPT_IMAGE_2,
      prompt: 'a lighthouse at dusk',
    })
    expect(job.externalRequestId).toContain('wf_1')

    expect(worker.requests).toHaveLength(1)
    const sent = worker.requests[0]
    expect(sent.url).toBe(`${WORKER}${EXECUTION_WORKER.IMAGE_QUEUE_PATH}`)
    expect(sent.headers.get('Content-Type')).toBe('application/json')
    expect(JSON.parse(sent.body)).toMatchObject({
      runId: job.id,
      providerId: AI_ADAPTER_TYPES.OPENAI,
      apiKeyId: key.id,
      providerInput: { prompt: 'a lighthouse at dusk' },
    })
    expect(sent.body).not.toContain('sk-test-not-a-real-key')
  })

  it('Worker 拒收：任务落成 FAILED，请求报错', async () => {
    const key = await seedAssistantKey(me.id, AI_ADAPTER_TYPES.OPENAI)
    worker.status = 400
    const res = await generate({ apiKeyId: key.id })
    expect(res.status).toBeGreaterThanOrEqual(400)
    const jobs = await db.generationJob.findMany({ where: { userId: me.id } })
    expect(jobs).toHaveLength(1)
    expect(jobs[0].status).toBe('FAILED')
  })

  it('点名别人的 key：不建任务、不派发', async () => {
    const theirs = await seedAssistantKey(other.id, AI_ADAPTER_TYPES.OPENAI)
    const res = await generate({ apiKeyId: theirs.id })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(await db.generationJob.count()).toBe(0)
    expect(worker.requests).toHaveLength(0)
  })

  it('空提示词 / 不认识的比例 400；限流 429；没登录 401；都不建任务', async () => {
    expect((await generate({ prompt: '' })).status).toBe(400)
    expect((await generate({ aspectRatio: '7:3' })).status).toBe(400)
    mockRateLimitExceeded()
    expect((await generate({})).status).toBe(429)
    mockUnauthenticated()
    expect((await generate({})).status).toBe(401)
    expect(await db.generationJob.count()).toBe(0)
    expect(worker.requests).toHaveLength(0)
  })
})
