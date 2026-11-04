/**
 * L2a 真库：Worker 调回来的三个内部接口——取 key（resolve-key）、回执（callback）、
 * 定时清扫（sweep）。签名、防重放、库全真；只设测试用的密钥。
 * 核库里的任务行与发给 Worker 的东西：别人的 key / 已结束的任务一律 403，签名不对 401。
 */
import { NextRequest } from 'next/server'
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

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { createInternalExecutionHeaders } from '@/lib/signature-verifiers/internal-execution'
import { POST as RESOLVE_KEY } from '@/app/api/internal/execution/resolve-key/route'
import { POST as CALLBACK } from '@/app/api/internal/execution/callback/route'
import { GET as SWEEP } from '@/app/api/internal/execution/sweep/route'
import { db } from '@/lib/db'
import { createTestUser, resetDatabase, seedAssistantKey } from '@/test/int/db'

type Envelope<T> = { success: boolean; data?: T; errorCode?: string }

const SECRET = 'test-internal-secret-not-real'
const CRON = 'test-cron-secret-not-real'

beforeAll(() => {
  vi.stubEnv('INTERNAL_CALLBACK_SECRET', SECRET)
  vi.stubEnv('CRON_SECRET', CRON)
})
afterAll(() => {
  vi.unstubAllEnvs()
})

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
})

function signed(
  path: string,
  body: unknown,
  opts: { secret?: string; nonce?: string } = {},
) {
  const url = `http://localhost:3000${path}`
  const raw = JSON.stringify(body)
  const headers = createInternalExecutionHeaders({
    body: raw,
    method: 'POST',
    url,
    secret: opts.secret ?? SECRET,
    ...(opts.nonce ? { nonce: opts.nonce } : {}),
  })
  return new NextRequest(url, {
    method: 'POST',
    body: raw,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function seedJob(
  userId: string,
  extra: Partial<{
    status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED'
    startedAt: Date
  }> = {},
) {
  return db.generationJob.create({
    data: {
      userId,
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      provider: 'openai',
      modelId: 'gpt-image-1',
      ...extra,
    },
  })
}

async function read<T>(res: Response) {
  return { status: res.status, body: (await res.json()) as Envelope<T> }
}

describe('POST /api/internal/execution/resolve-key（真库）', () => {
  const resolve = async (
    body: unknown,
    opts?: Parameters<typeof signed>[2],
  ) => {
    const res = await RESOLVE_KEY(
      signed('/api/internal/execution/resolve-key', body, opts),
    )
    return { ...(await read<{ apiKey: string }>(res)), headers: res.headers }
  }

  it('任务主人的 key：解密后交给 Worker，不进缓存', async () => {
    const job = await seedJob(me.id, { status: 'RUNNING' })
    const key = await seedAssistantKey(me.id, AI_ADAPTER_TYPES.OPENAI)
    const res = await resolve({ runId: job.id, apiKeyId: key.id })
    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({ apiKey: 'sk-test-not-a-real-key' })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('别人的 key、已结束 / 不存在的任务一律 403；没给 key 400', async () => {
    const job = await seedJob(me.id, { status: 'RUNNING' })
    const done = await seedJob(me.id, { status: 'COMPLETED' })
    const mine = await seedAssistantKey(me.id, AI_ADAPTER_TYPES.OPENAI)
    const theirs = await seedAssistantKey(other.id, AI_ADAPTER_TYPES.OPENAI)

    expect((await resolve({ runId: job.id, apiKeyId: theirs.id })).status).toBe(
      403,
    )
    expect((await resolve({ runId: done.id, apiKeyId: mine.id })).status).toBe(
      403,
    )
    expect(
      (await resolve({ runId: 'missing', apiKeyId: mine.id })).status,
    ).toBe(403)
    expect((await resolve({ runId: job.id })).status).toBe(400)
  })

  it('签名不对 401；同一个 nonce 再来一次 401（防重放）', async () => {
    const job = await seedJob(me.id, { status: 'RUNNING' })
    const key = await seedAssistantKey(me.id, AI_ADAPTER_TYPES.OPENAI)
    const body = { runId: job.id, apiKeyId: key.id }

    const forged = await resolve(body, { secret: 'wrong-secret' })
    expect(forged.status).toBe(401)
    expect(forged.body.data).toBeUndefined()

    const nonce = `nonce-${job.id}`.replaceAll(/[^a-zA-Z0-9_-]/g, '')
    expect((await resolve(body, { nonce })).status).toBe(200)
    const replay = await resolve(body, { nonce })
    expect(replay.status).toBe(401)
    expect(replay.body.errorCode).toBe('EXECUTION_REPLAY_DETECTED')
  })
})

describe('POST /api/internal/execution/callback（真库）', () => {
  const callback = async (body: unknown, opts?: Parameters<typeof signed>[2]) =>
    read<{ action: string; jobStatus: string }>(
      await CALLBACK(signed('/api/internal/execution/callback', body, opts)),
    )
  const ts = () => new Date().toISOString()

  it('ping 只记一笔，任务不变', async () => {
    const job = await seedJob(me.id, { status: 'RUNNING' })
    const res = await callback({ runId: job.id, kind: 'ping', ts: ts() })
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      action: 'logged',
      jobStatus: 'RUNNING',
    })
    expect(
      (await db.generationJob.findUniqueOrThrow({ where: { id: job.id } }))
        .status,
    ).toBe('RUNNING')
  })

  it('result 带错：任务落成 FAILED，错误原样记下', async () => {
    const job = await seedJob(me.id, { status: 'RUNNING' })
    const res = await callback({
      runId: job.id,
      kind: 'result',
      ts: ts(),
      data: { error: 'provider exploded', errorCode: 'PROVIDER_ERROR' },
    })
    expect(res.body.data).toMatchObject({
      action: 'failed',
      jobStatus: 'FAILED',
    })
    expect(
      await db.generationJob.findUniqueOrThrow({ where: { id: job.id } }),
    ).toMatchObject({
      status: 'FAILED',
      errorMessage: 'provider exploded',
      errorCode: 'PROVIDER_ERROR',
    })
  })

  it('已结束的任务：忽略，不改库', async () => {
    const job = await seedJob(me.id, { status: 'COMPLETED' })
    const res = await callback({
      runId: job.id,
      kind: 'result',
      ts: ts(),
      data: { error: 'late failure' },
    })
    expect(res.body.data).toMatchObject({ action: 'ignored-terminal' })
    expect(
      await db.generationJob.findUniqueOrThrow({ where: { id: job.id } }),
    ).toMatchObject({ status: 'COMPLETED', errorMessage: null })
  })

  it('没这个任务 404；不认识的 kind 400；签名不对 401 不改库', async () => {
    const job = await seedJob(me.id, { status: 'RUNNING' })
    expect(
      (await callback({ runId: 'missing', kind: 'ping', ts: ts() })).status,
    ).toBe(404)
    expect(
      (await callback({ runId: job.id, kind: 'nope', ts: ts() })).status,
    ).toBe(400)
    expect(
      (
        await callback(
          { runId: job.id, kind: 'result', ts: ts(), data: { error: 'x' } },
          { secret: 'wrong-secret' },
        )
      ).status,
    ).toBe(401)
    expect(
      (await db.generationJob.findUniqueOrThrow({ where: { id: job.id } }))
        .status,
    ).toBe('RUNNING')
  })
})

describe('GET /api/internal/execution/sweep（真库）', () => {
  const sweep = (token?: string) =>
    SWEEP(
      new Request('http://localhost:3000/api/internal/execution/sweep', {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      }),
    )

  it('跑了超过一小时还在 RUNNING 的任务收成失败；新的不动', async () => {
    const stale = await seedJob(me.id, {
      status: 'RUNNING',
      startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    })
    const fresh = await seedJob(me.id, {
      status: 'RUNNING',
      startedAt: new Date(),
    })

    const res = await read<{ staleJobsReaped: number }>(await sweep(CRON))
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ staleJobsReaped: 1 })
    expect(
      (await db.generationJob.findUniqueOrThrow({ where: { id: stale.id } }))
        .status,
    ).toBe('FAILED')
    expect(
      (await db.generationJob.findUniqueOrThrow({ where: { id: fresh.id } }))
        .status,
    ).toBe('RUNNING')
  })

  it('token 不对 / 没给 401，不动库', async () => {
    const stale = await seedJob(me.id, {
      status: 'RUNNING',
      startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    })
    expect((await sweep('wrong')).status).toBe(401)
    expect((await sweep()).status).toBe(401)
    expect(
      (await db.generationJob.findUniqueOrThrow({ where: { id: stale.id } }))
        .status,
    ).toBe('RUNNING')
  })
})
