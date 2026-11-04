/**
 * L2a 真库：Worker 取 key（api-key-resolver.service）。任务、用户 key、Civitai token 都真存、
 * 真解密；平台 key 走真 env 读取（测试里设假值）。别人的 / 停用的 key、已结束的任务一律 403。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { db } from '@/lib/db'
import { setCivitaiToken } from '@/features/lora/server'
import { resolveExecutionApiKey } from '@/services/api-key-resolver.service'
import { createTestUser, resetDatabase, seedAssistantKey } from '@/test/int/db'

const USER_KEY = 'sk-test-not-a-real-key'

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
})
afterEach(() => {
  vi.unstubAllEnvs()
})

function seedJob(
  adapterType: string,
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' = 'RUNNING',
) {
  return db.generationJob.create({
    data: {
      userId: me.id,
      adapterType,
      provider: adapterType,
      modelId: 'm',
      status,
    },
  })
}

const forbidden = { errorCode: 'FORBIDDEN', httpStatus: 403 }

describe('resolveExecutionApiKey（真库）', () => {
  it('任务主人的 key：解密后交出', async () => {
    const job = await seedJob(AI_ADAPTER_TYPES.OPENAI)
    const key = await seedAssistantKey(me.id, AI_ADAPTER_TYPES.OPENAI)
    expect(
      await resolveExecutionApiKey({ runId: job.id, apiKeyId: key.id }),
    ).toEqual({ apiKey: USER_KEY })
  })

  it('别人的 key、停用的 key、没有的任务、已结束的任务一律 403', async () => {
    const job = await seedJob(AI_ADAPTER_TYPES.OPENAI)
    const theirs = await seedAssistantKey(other.id, AI_ADAPTER_TYPES.OPENAI)
    const mine = await seedAssistantKey(me.id, AI_ADAPTER_TYPES.OPENAI)
    const inactive = await db.userApiKey.create({
      data: {
        userId: me.id,
        adapterType: AI_ADAPTER_TYPES.OPENAI,
        modelId: 'gpt-image-2',
        providerConfig: {},
        label: 'old key',
        encryptedKey: mine.encryptedKey,
        isActive: false,
      },
    })

    await expect(
      resolveExecutionApiKey({ runId: job.id, apiKeyId: theirs.id }),
    ).rejects.toMatchObject(forbidden)
    await expect(
      resolveExecutionApiKey({ runId: job.id, apiKeyId: inactive.id }),
    ).rejects.toMatchObject(forbidden)
    await expect(
      resolveExecutionApiKey({ runId: 'missing', apiKeyId: mine.id }),
    ).rejects.toMatchObject(forbidden)
    for (const status of ['COMPLETED', 'FAILED', 'CANCELLED'] as const) {
      const done = await seedJob(AI_ADAPTER_TYPES.OPENAI, status)
      await expect(
        resolveExecutionApiKey({ runId: done.id, apiKeyId: mine.id }),
      ).rejects.toMatchObject(forbidden)
    }
  })

  it('平台 key：adapter 要和任务对得上；没配就 403', async () => {
    vi.stubEnv('FAL_API_KEY', 'test-platform-fal-key')
    const job = await seedJob(AI_ADAPTER_TYPES.FAL)
    expect(
      await resolveExecutionApiKey({
        runId: job.id,
        useSystemKey: true,
        adapterType: AI_ADAPTER_TYPES.FAL,
      }),
    ).toEqual({ apiKey: 'test-platform-fal-key' })
    await expect(
      resolveExecutionApiKey({
        runId: job.id,
        useSystemKey: true,
        adapterType: AI_ADAPTER_TYPES.OPENAI,
      }),
    ).rejects.toMatchObject(forbidden)

    vi.stubEnv('FAL_API_KEY', '')
    await expect(
      resolveExecutionApiKey({
        runId: job.id,
        useSystemKey: true,
        adapterType: AI_ADAPTER_TYPES.FAL,
      }),
    ).rejects.toMatchObject(forbidden)
  })

  it('Civitai token：主人自己存的优先，没有用平台的；都没有 / 不支持的 adapter 403', async () => {
    vi.stubEnv('CIVITAI_API_TOKEN', 'test-platform-civitai')
    const job = await seedJob(AI_ADAPTER_TYPES.REPLICATE)
    expect(
      await resolveExecutionApiKey({ runId: job.id, keyKind: 'civitai' }),
    ).toEqual({ apiKey: 'test-platform-civitai' })

    // 走真的存 token 那条路（真加密）
    vi.stubEnv('CIVITAI_TOKEN_SECRET', 'b'.repeat(64))
    await setCivitaiToken(me.clerkId, 'test-user-civitai')
    expect(
      await resolveExecutionApiKey({ runId: job.id, keyKind: 'civitai' }),
    ).toEqual({ apiKey: 'test-user-civitai' })

    const openai = await seedJob(AI_ADAPTER_TYPES.OPENAI)
    await expect(
      resolveExecutionApiKey({ runId: openai.id, keyKind: 'civitai' }),
    ).rejects.toMatchObject(forbidden)

    await db.user.update({ where: { id: me.id }, data: { civitaiToken: null } })
    vi.stubEnv('CIVITAI_API_TOKEN', '')
    await expect(
      resolveExecutionApiKey({ runId: job.id, keyKind: 'civitai' }),
    ).rejects.toMatchObject(forbidden)
  })
})
