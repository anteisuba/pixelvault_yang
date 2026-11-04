/**
 * L2a 真库：视频 / 语音提交（/api/generate-video、/api/generate-audio）。
 * 只假边界：Clerk 登录、限流、执行 Worker（fetch）。选路、建任务、派发全真：
 * 核库里的任务行、发给 Worker 的东西（带 key id、不带明文）与返回值。
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
import { POST as GENERATE_VIDEO } from '@/app/api/generate-video/route'
import { POST as GENERATE_AUDIO } from '@/app/api/generate-audio/route'
import { db } from '@/lib/db'
import { createTestUser, resetDatabase, seedAssistantKey } from '@/test/int/db'

type Envelope<T> = { success: boolean; data?: T; errorCode?: string }

const WORKER = 'https://worker.test'
const worker = vi.hoisted(() => ({
  requests: [] as Array<{ url: string; body: string }>,
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
  worker.requests = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input)
      if (!url.startsWith(WORKER)) return new Response('nope', { status: 404 })
      worker.requests.push({ url, body: String(init?.body ?? '') })
      return Response.json({ workflowInstanceId: 'wf_1' })
    }),
  )
})

const cases = [
  {
    name: 'video',
    handler: GENERATE_VIDEO,
    path: '/api/generate-video',
    adapter: AI_ADAPTER_TYPES.FAL,
    body: { prompt: 'a cat walking on the beach', modelId: AI_MODELS.WAN_30 },
    outputType: 'VIDEO',
  },
  {
    name: 'audio',
    handler: GENERATE_AUDIO,
    path: '/api/generate-audio',
    adapter: AI_ADAPTER_TYPES.FISH_AUDIO,
    body: {
      prompt: 'Hello there.',
      modelId: AI_MODELS.FISH_AUDIO_S2_PRO,
      voiceId: 'voice_test_1',
    },
    outputType: 'AUDIO',
  },
] as const

describe.each(cases)(
  'POST $path（真库，假 Worker）',
  ({ handler, path, adapter, body, outputType }) => {
    const submit = async (extra: Record<string, unknown> = {}) => {
      const res = await handler(createPOST(path, { ...body, ...extra }))
      return {
        status: res.status,
        body: await parseJSON<Envelope<{ jobId: string }>>(res),
      }
    }

    it('建任务、派发给 Worker（带 key id 不带明文），回任务号', async () => {
      const key = await seedAssistantKey(me.id, adapter)
      const res = await submit({ apiKeyId: key.id })
      expect(res.status).toBe(200)

      const job = await db.generationJob.findUniqueOrThrow({
        where: { id: res.body.data!.jobId },
      })
      expect(job).toMatchObject({
        userId: me.id,
        adapterType: adapter,
        modelId: body.modelId,
      })

      expect(worker.requests).toHaveLength(1)
      expect(worker.requests[0].url).toBe(
        `${WORKER}${EXECUTION_WORKER.FAL_QUEUE_PATH}`,
      )
      expect(JSON.parse(worker.requests[0].body)).toMatchObject({
        runId: job.id,
        outputType,
        providerId: adapter,
        apiKeyId: key.id,
      })
      expect(worker.requests[0].body).not.toContain('sk-test-not-a-real-key')
    })

    it('点名别人的 key：不建任务、不派发', async () => {
      const theirs = await seedAssistantKey(other.id, adapter)
      expect(
        (await submit({ apiKeyId: theirs.id })).status,
      ).toBeGreaterThanOrEqual(400)
      expect(await db.generationJob.count()).toBe(0)
      expect(worker.requests).toHaveLength(0)
    })

    it('空提示词 400；限流 429；没登录 401；都不建任务', async () => {
      expect((await submit({ prompt: '' })).status).toBe(400)
      mockRateLimitExceeded()
      expect((await submit()).status).toBe(429)
      mockUnauthenticated()
      expect((await submit()).status).toBe(401)
      expect(await db.generationJob.count()).toBe(0)
      expect(worker.requests).toHaveLength(0)
    })
  },
)
