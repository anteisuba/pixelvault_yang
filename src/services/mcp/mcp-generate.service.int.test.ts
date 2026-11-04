/**
 * L2a 真库 + 真提交链路：MCP 发起出图 → 她确认 → 出图 → AI 回来问结果。
 * 只假边界：执行 Worker（fetch）、R2 的真 I/O。核请求行、任务行与返回值。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/services/storage/r2', async (importOriginal) =>
  (await import('@/test/int/fake-r2')).fakeR2Module(await importOriginal()),
)

import { AI_MODELS } from '@/constants/models/enum'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { db } from '@/lib/db'
import {
  createGenerationRequest,
  decideGenerationRequest,
  getGenerationForMcp,
} from '@/services/mcp/mcp-generate.service'
import { createTestUser, resetDatabase, seedAssistantKey } from '@/test/int/db'
import {
  installFakeExecutionWorker,
  type FakeExecutionWorker,
} from '@/test/int/execution-worker'
import { fakeBucket } from '@/test/int/fake-r2'
import { seedGeneration } from '@/test/int/seed-generation'

const MODEL = AI_MODELS.OPENAI_GPT_IMAGE_2
const NOW = new Date('2026-10-30T09:00:00.000Z')
const LATER = new Date('2026-10-30T10:00:00.000Z')

let me: Awaited<ReturnType<typeof createTestUser>>
let owner: {
  tokenId: string
  userId: string
  clerkId: string
  access: 'generate'
}
let worker: FakeExecutionWorker

const jobsOfMe = () => db.generationJob.findMany({ where: { userId: me.id } })
const requestRow = (id: string) =>
  db.mcpGenerationRequest.findUniqueOrThrow({ where: { id } })

beforeEach(async () => {
  await resetDatabase()
  fakeBucket.reset()
  me = await createTestUser()
  const token = await db.mcpToken.create({
    data: {
      userId: me.id,
      name: 'Claude',
      tokenHash: `hash-${me.id}`,
      last4: 'abcd',
      access: 'generate',
    },
  })
  owner = {
    tokenId: token.id,
    userId: me.id,
    clerkId: me.clerkId,
    access: 'generate',
  }
  worker = installFakeExecutionWorker()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('createGenerationRequest', () => {
  it('只记下要出什么，等她确认；什么都还没发出去', async () => {
    const pending = await createGenerationRequest(
      owner,
      { prompt: 'rain', model: MODEL, count: 2 },
      NOW,
    )

    expect(pending.summary).toContain(`2 × ${MODEL}`)
    const row = await requestRow(pending.requestId)
    expect(row).toMatchObject({
      userId: me.id,
      tokenId: owner.tokenId,
      kind: 'image',
      status: 'pending',
      jobIds: [],
    })
    expect(row.expiresAt.getTime()).toBeGreaterThan(NOW.getTime())
    expect(await jobsOfMe()).toEqual([])
    expect(worker.requests).toEqual([])
  })

  it('参考图不是她的：拒，并点名是哪张；不落请求', async () => {
    await expect(
      createGenerationRequest(owner, {
        prompt: 'rain',
        model: MODEL,
        references: ['图_9'],
      }),
    ).rejects.toThrow(/图_9/)
    expect(await db.mcpGenerationRequest.count()).toBe(0)
  })
})

describe('decideGenerationRequest', () => {
  it('这一下抢到确认：每张一个出图任务，任务号记回请求行', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.OPENAI)
    const { requestId } = await createGenerationRequest(
      owner,
      { prompt: 'rain', model: MODEL, count: 2 },
      NOW,
    )

    const result = await decideGenerationRequest(
      owner,
      requestId,
      'confirm',
      NOW,
    )

    const jobs = await jobsOfMe()
    expect(jobs).toHaveLength(2)
    expect(result).toEqual({
      status: 'confirmed',
      jobIds: expect.arrayContaining(jobs.map((job) => job.id)),
      error: null,
    })
    expect(worker.requests).toHaveLength(2)
    expect(await requestRow(requestId)).toMatchObject({
      status: 'confirmed',
      jobIds: result!.jobIds,
      error: null,
    })
  })

  it('别处已经确认过：再点一下不再出图，回已发出的任务', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.OPENAI)
    const { requestId } = await createGenerationRequest(
      owner,
      { prompt: 'rain', model: MODEL },
      NOW,
    )
    const first = await decideGenerationRequest(
      owner,
      requestId,
      'confirm',
      NOW,
    )

    const second = await decideGenerationRequest(
      owner,
      requestId,
      'confirm',
      NOW,
    )

    expect(second?.jobIds).toEqual(first!.jobIds)
    expect(await jobsOfMe()).toHaveLength(1)
  })

  it('拒绝：一张都不出', async () => {
    const { requestId } = await createGenerationRequest(
      owner,
      { prompt: 'rain', model: MODEL },
      NOW,
    )

    const result = await decideGenerationRequest(
      owner,
      requestId,
      'decline',
      NOW,
    )

    expect(result?.status).toBe('declined')
    expect(await jobsOfMe()).toEqual([])
    expect((await requestRow(requestId)).status).toBe('declined')
  })

  it('别人的请求：够不着，也不出图', async () => {
    const other = await createTestUser()
    const { requestId } = await createGenerationRequest(
      { ...owner, tokenId: owner.tokenId, userId: other.id },
      { prompt: 'rain', model: MODEL },
      NOW,
    )

    expect(
      await decideGenerationRequest(owner, requestId, 'confirm', NOW),
    ).toBeNull()
    expect((await requestRow(requestId)).status).toBe('pending')
    expect(await db.generationJob.count()).toBe(0)
  })
})

describe('getGenerationForMcp', () => {
  it('过期没人确认：说已作废', async () => {
    const { requestId } = await createGenerationRequest(
      owner,
      { prompt: 'rain', model: MODEL },
      NOW,
    )

    expect(await getGenerationForMcp(owner, requestId, LATER)).toMatch(
      /dropped/,
    )
  })

  it('出好的按图编号报，还在跑的说在跑', async () => {
    const generation = await seedGeneration(me.id, {
      seq: 12,
      outputType: 'IMAGE',
    })
    const job = (data: { status: 'COMPLETED' | 'RUNNING' }) =>
      db.generationJob.create({
        data: {
          userId: me.id,
          adapterType: AI_ADAPTER_TYPES.OPENAI,
          provider: 'openai',
          modelId: MODEL,
          startedAt: new Date(),
          ...(data.status === 'COMPLETED'
            ? { generationId: generation.id }
            : {}),
          ...data,
        },
      })
    const done = await job({ status: 'COMPLETED' })
    const running = await job({ status: 'RUNNING' })
    const row = await db.mcpGenerationRequest.create({
      data: {
        userId: me.id,
        tokenId: owner.tokenId,
        kind: 'image',
        request: {},
        summary: `2 × ${MODEL}`,
        status: 'confirmed',
        jobIds: [done.id, running.id],
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    })

    const text = await getGenerationForMcp(owner, row.id)

    expect(text).toMatch(/图_0*12: done/)
    expect(text).toMatch(/in progress/)
  })
})
