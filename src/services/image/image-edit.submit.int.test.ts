/**
 * L2a 真库 + 真提交链路：Ideogram 精确编辑（`submitIdeogramImageEdit`）。
 * 只假边界：执行 Worker（fetch）、R2 的真 I/O。核任务行、发给 Worker 的东西与返回值。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/services/storage/r2', async (importOriginal) =>
  (await import('@/test/int/fake-r2')).fakeR2Module(await importOriginal()),
)

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { db } from '@/lib/db'
import { submitIdeogramImageEdit } from '@/services/image/image-edit.service'
import { createTestUser, resetDatabase, seedAssistantKey } from '@/test/int/db'
import {
  installFakeExecutionWorker,
  type FakeExecutionWorker,
} from '@/test/int/execution-worker'
import { FAKE_CDN, fakeBucket } from '@/test/int/fake-r2'
import { seedGeneration } from '@/test/int/seed-generation'

let me: Awaited<ReturnType<typeof createTestUser>>
let worker: FakeExecutionWorker

const SOURCE = `${FAKE_CDN}/source.png`
const REF = `${FAKE_CDN}/ref.png`

const jobsOfMe = () => db.generationJob.findMany({ where: { userId: me.id } })

beforeEach(async () => {
  await resetDatabase()
  fakeBucket.reset()
  me = await createTestUser()
  worker = installFakeExecutionWorker()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('submitIdeogramImageEdit', () => {
  it('标注改图：用选中的 key、底图在前参考图在后、提示词带上标注，任务上记来源作品与原提示词', async () => {
    const key = await seedAssistantKey(me.id, AI_ADAPTER_TYPES.IDEOGRAM)
    const source = await seedGeneration(me.id, {
      prompt: 'Original source prompt',
    })

    const result = await submitIdeogramImageEdit(me.clerkId, {
      modelId: 'ideogram-4.5',
      apiKeyId: key.id,
      sourceGenerationId: source.id,
      imageUrl: SOURCE,
      referenceImages: [REF],
      annotations: [{ index: 1, instruction: 'Make the mug blue' }],
    })

    const [job] = await jobsOfMe()
    expect(result.jobId).toBe(job!.id)
    expect(worker.requests).toHaveLength(1)
    const sent = worker.requests[0]!.json as {
      providerId: string
      apiKeyId?: string
      providerInput: Record<string, unknown>
    }
    expect(sent).toMatchObject({
      providerId: AI_ADAPTER_TYPES.IDEOGRAM,
      apiKeyId: key.id,
      providerInput: {
        imageOperation: 'precise-edit',
        referenceImages: [SOURCE, REF],
        prompt: expect.stringContaining('Make the mug blue'),
      },
    })
    expect(JSON.parse(job!.externalRequestId ?? '{}')).toMatchObject({
      imageOperation: 'precise-edit',
      sourceGenerationId: source.id,
      imageEditSourcePrompt: 'Original source prompt',
      advancedParams: { quality: 'medium' },
    })
  })

  it('来源作品是别人的：派发前就拒，不建任务', async () => {
    const key = await seedAssistantKey(me.id, AI_ADAPTER_TYPES.IDEOGRAM)
    const other = await createTestUser()
    const foreign = await seedGeneration(other.id)

    await expect(
      submitIdeogramImageEdit(me.clerkId, {
        modelId: 'ideogram-4.5',
        apiKeyId: key.id,
        sourceGenerationId: foreign.id,
        imageUrl: SOURCE,
        annotations: [{ index: 1, instruction: 'Make the mug blue' }],
      }),
    ).rejects.toThrow('Source generation not found')
    expect(await jobsOfMe()).toEqual([])
    expect(worker.requests).toEqual([])
  })
})
