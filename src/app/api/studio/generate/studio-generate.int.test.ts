/**
 * L2a 真库：工作台出图（/api/studio/generate）——编译 @Image 引用、合并负面词、带批次号，
 * 然后走真的出图提交。只假边界：Clerk 登录、限流、执行 Worker（fetch）。
 * 核库里的任务行（元数据里的批次 / 参考图）与发给 Worker 的提示词。
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
import { AI_MODELS } from '@/constants/models/enum'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { POST } from '@/app/api/studio/generate/route'
import { db } from '@/lib/db'
import { createTestUser, resetDatabase, seedAssistantKey } from '@/test/int/db'

type Envelope<T> = { success: boolean; data?: T; errorCode?: string }

const WORKER = 'https://worker.test'
/** 我们自己桶里的图：不用再转存。 */
const REF = 'https://pub-5346558f8dc549f9ba5217489fe5395e.r2.dev/ref.png'

const worker = vi.hoisted(() => ({ requests: [] as string[] }))

beforeAll(() => {
  vi.stubEnv('EXECUTION_WORKER_BASE_URL', WORKER)
  vi.stubEnv('INTERNAL_CALLBACK_SECRET', 'test-internal-secret-not-real')
})
afterAll(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

let me: Awaited<ReturnType<typeof createTestUser>>
let keyId: string

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  keyId = (await seedAssistantKey(me.id, AI_ADAPTER_TYPES.OPENAI)).id
  mockAuthenticated(me.clerkId)
  mockRateLimitAllowed()
  worker.requests = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input)
      if (!url.startsWith(WORKER)) return new Response('nope', { status: 404 })
      worker.requests.push(String(init?.body ?? ''))
      return Response.json({ workflowInstanceId: 'wf_1' })
    }),
  )
})

async function generate(body: Record<string, unknown>) {
  const res = await POST(
    createPOST('/api/studio/generate', {
      modelId: AI_MODELS.OPENAI_GPT_IMAGE_2,
      apiKeyId: keyId,
      ...body,
    }),
  )
  return {
    status: res.status,
    body: await parseJSON<Envelope<{ jobId: string }>>(res),
  }
}

describe('POST /api/studio/generate（真库，假 Worker）', () => {
  it('@Image1 编成「reference image 1」，参考图、批次号、负面词都带上', async () => {
    const res = await generate({
      freePrompt: 'the girl in @Image1 waving',
      referenceImages: [REF],
      advancedParams: { negativePrompt: 'blurry' },
      runGroupId: 'run-123',
      runGroupType: 'variant',
      runGroupIndex: 2,
    })
    expect(res.status).toBe(200)

    const job = await db.generationJob.findUniqueOrThrow({
      where: { id: res.body.data!.jobId },
    })
    expect(job.prompt).toBe('the girl in reference image 1 waving')
    expect(JSON.parse(job.externalRequestId!)).toMatchObject({
      aspectRatio: '1:1',
      referenceImageUrl: REF,
      runGroupId: 'run-123',
      runGroupType: 'variant',
      runGroupIndex: 2,
      advancedParams: { negativePrompt: 'blurry' },
    })

    expect(worker.requests).toHaveLength(1)
    expect(JSON.parse(worker.requests[0])).toMatchObject({
      runId: job.id,
      apiKeyId: keyId,
      providerInput: {
        prompt: 'the girl in reference image 1 waving',
        referenceImages: [REF],
      },
    })
  })

  it('@ 了一张不存在的参考图：400，不建任务', async () => {
    const res = await generate({
      freePrompt: 'see @Image2',
      referenceImages: [REF],
    })
    expect(res.status).toBe(400)
    expect(await db.generationJob.count()).toBe(0)
    expect(worker.requests).toHaveLength(0)
  })

  it('不带 modelId 400；限流 429；没登录 401；都不建任务', async () => {
    expect(
      (await generate({ modelId: undefined, freePrompt: 'x' })).status,
    ).toBe(400)
    mockRateLimitExceeded()
    expect((await generate({ freePrompt: 'x' })).status).toBe(429)
    mockUnauthenticated()
    expect((await generate({ freePrompt: 'x' })).status).toBe(401)
    expect(await db.generationJob.count()).toBe(0)
    expect(worker.requests).toHaveLength(0)
  })
})
