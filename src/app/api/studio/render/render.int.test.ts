/**
 * L2a 真库：成片导出（/api/studio/render 提交、/[jobId] 查、/[jobId]/cancel 取消）。
 * 只假边界：Clerk 登录、限流、渲染 Worker（fetch）。建任务、签名、归属校验全真：
 * 核库里的任务行与发给 Worker 的东西。别人的任务一律当「没有」（404）。
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

// next-intl 的服务端入口只认 react-server 条件，vitest 里拿到的是客户端那份（直接抛）。
// 换成同一个库的 createTranslator + 真文案：拼出来的就是线上那句。
vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl')
  const { MESSAGES } = await import('@/messages')
  return {
    getTranslations: async ({
      locale,
      namespace,
    }: {
      locale: keyof typeof MESSAGES
      namespace: string
    }) => createTranslator({ locale, messages: MESSAGES[locale], namespace }),
  }
})

import {
  createGET,
  createPOST,
  mockAuthenticated,
  mockRateLimitAllowed,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'
import { EXECUTION_INTERNAL } from '@/constants/execution'
import { RENDER_WORKER } from '@/constants/render-video'
import { POST } from '@/app/api/studio/render/route'
import { GET } from '@/app/api/studio/render/[jobId]/route'
import { POST as CANCEL } from '@/app/api/studio/render/[jobId]/cancel/route'
import { db } from '@/lib/db'
import { createTestUser, resetDatabase } from '@/test/int/db'

type Envelope<T> = { success: boolean; data?: T; errorCode?: string }
type JobView = { jobId: string; status: string; name: string }

const WORKER = 'https://render-worker.test'
const worker = vi.hoisted(() => ({
  status: 200,
  requests: [] as Array<{ url: string; body: string; headers: Headers }>,
}))

beforeAll(() => {
  vi.stubEnv('RENDER_WORKER_BASE_URL', WORKER)
  vi.stubEnv('INTERNAL_CALLBACK_SECRET', 'test-internal-secret-not-real')
})
afterAll(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const PLAN = {
  version: 1,
  name: '成片',
  projectId: 'proj_1',
  output: {
    aspect: '16:9',
    resolution: '1080p',
    width: 1920,
    height: 1080,
    fps: 25,
  },
  video: [
    {
      id: 'c1',
      src: 'https://cdn.test/v1.mp4',
      in: 0,
      out: 4,
      speed: 1,
      muted: false,
      transitionOut: 'none',
      transitionSec: 0,
      durationSec: 4,
      sourceNodeId: 'v1',
    },
  ],
  audio: [],
  music: [],
  totalDurationSec: 4,
}

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
        ? Response.json({ ok: true })
        : new Response('rejected', { status: worker.status })
    }),
  )
})

const params = (jobId: string) => ({ params: Promise.resolve({ jobId }) })

async function submit(body: Record<string, unknown> = {}) {
  const res = await POST(
    createPOST('/api/studio/render', { plan: PLAN, ...body }),
  )
  return { status: res.status, body: await parseJSON<Envelope<JobView>>(res) }
}

describe('/api/studio/render（真库，假 Worker）', () => {
  it('提交：建渲染任务、带签名派给 Worker，回 queued', async () => {
    const res = await submit()
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ status: 'queued', name: '成片' })

    const job = await db.generationJob.findUniqueOrThrow({
      where: { id: res.body.data!.jobId },
    })
    expect(job).toMatchObject({ userId: me.id, prompt: '成片' })

    expect(worker.requests).toHaveLength(1)
    const sent = worker.requests[0]
    expect(sent.url).toBe(`${WORKER}${RENDER_WORKER.SUBMIT_PATH}`)
    expect(sent.headers.get(EXECUTION_INTERNAL.SIGNATURE_HEADER)).toMatch(
      /^[0-9a-f]+$/,
    )
    expect(JSON.parse(sent.body)).toMatchObject({
      jobId: job.id,
      userId: me.id,
      plan: { name: '成片', totalDurationSec: 4 },
      landing: { draft: false, canvasProjectId: 'proj_1' },
    })
  })

  it('Worker 拒收：502，任务记成失败', async () => {
    worker.status = 400
    const res = await submit()
    expect(res.status).toBe(502)
    expect(res.body.errorCode).toBe('RENDER_DISPATCH_FAILED')
    const [job] = await db.generationJob.findMany({ where: { userId: me.id } })
    expect(job).toMatchObject({
      status: 'FAILED',
      errorCode: 'RENDER_DISPATCH_FAILED',
    })
  })

  it('查与取消：自己的能查、取消落库并通知 Worker；别人的 404 不动', async () => {
    const mine = (await submit()).body.data!.jobId
    mockAuthenticated(other.clerkId)
    expect(
      (await GET(createGET(`/api/studio/render/${mine}`), params(mine))).status,
    ).toBe(404)
    expect(
      (
        await CANCEL(
          createPOST(`/api/studio/render/${mine}/cancel`, {}),
          params(mine),
        )
      ).status,
    ).toBe(404)
    expect(
      (await db.generationJob.findUniqueOrThrow({ where: { id: mine } }))
        .status,
    ).not.toBe('CANCELLED')

    mockAuthenticated(me.clerkId)
    const view = await parseJSON<Envelope<JobView>>(
      await GET(createGET(`/api/studio/render/${mine}`), params(mine)),
    )
    expect(view.data).toMatchObject({ jobId: mine, status: 'running' })

    const cancelled = await CANCEL(
      createPOST(`/api/studio/render/${mine}/cancel`, {}),
      params(mine),
    )
    expect(cancelled.status).toBe(200)
    expect(
      (await db.generationJob.findUniqueOrThrow({ where: { id: mine } }))
        .status,
    ).toBe('CANCELLED')
    expect(worker.requests.at(-1)).toMatchObject({
      url: `${WORKER}${RENDER_WORKER.CANCEL_PATH}`,
      body: JSON.stringify({ jobId: mine }),
    })
  })

  it('普通出图任务不归这条路：查不到', async () => {
    const job = await db.generationJob.create({
      data: {
        userId: me.id,
        adapterType: 'openai',
        provider: 'openai',
        modelId: 'gpt-image-2',
      },
    })
    expect(
      (await GET(createGET(`/api/studio/render/${job.id}`), params(job.id)))
        .status,
    ).toBe(404)
  })

  it('计划缺镜头 400；没登录 401；都不建任务', async () => {
    expect((await submit({ plan: { ...PLAN, video: 'nope' } })).status).toBe(
      400,
    )
    mockUnauthenticated()
    expect((await submit()).status).toBe(401)
    expect(await db.generationJob.count()).toBe(0)
    expect(worker.requests).toHaveLength(0)
  })
})
