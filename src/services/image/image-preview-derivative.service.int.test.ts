/**
 * L2a 真库：图片缩略图 / 预览图的派生任务（execution outbox）。
 * 只假边界：R2 那一跳（Worker 生成派生图）。断言 outbox 行与 generation 行最后的样子。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const derive = vi.hoisted(() => vi.fn())
vi.mock('@/services/storage/r2', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/storage/r2')>()),
  createImagePreviewAssets: derive,
}))

import { EXECUTION_OUTBOX_KINDS } from '@/constants/execution'
import { db } from '@/lib/db'
import {
  enqueueImagePreviewDerivatives,
  processImagePreviewDerivativeOutbox,
  processPendingImagePreviewDerivativeOutboxes,
} from '@/services/image/image-preview-derivative.service'
import { createTestUser, resetDatabase } from '@/test/int/db'

const assetsFor = (key: string) => ({
  thumbnailUrl: `https://cdn.test/${key}.thumbnail.webp`,
  thumbnailStorageKey: `${key}.thumbnail.webp`,
  previewUrl: `https://cdn.test/${key}.preview.webp`,
  previewStorageKey: `${key}.preview.webp`,
})

let userId: string

// 每个 job 每种 kind 只有一条 outbox（唯一约束），所以每张图各开一个 job。
async function seedJob() {
  const job = await db.generationJob.create({
    data: {
      userId,
      adapterType: 'fal',
      provider: 'fal',
      modelId: 'seedream-5.0-lite',
    },
  })
  return job.id
}

async function seedImage(name: string) {
  const generation = await db.generation.create({
    data: {
      userId,
      url: `https://cdn.test/${name}.png`,
      storageKey: `generations/u/image/${name}.png`,
      prompt: 'a fox',
      model: 'seedream-5.0-lite',
      provider: 'fal',
    },
  })
  return generation
}

async function enqueue(name: string) {
  const generation = await seedImage(name)
  const generationJobId = await seedJob()
  const outbox = await enqueueImagePreviewDerivatives({
    generationJobId,
    generationId: generation.id,
    sourceStorageKey: generation.storageKey,
  })
  return { generation, outbox, generationJobId }
}

beforeEach(async () => {
  await resetDatabase()
  vi.clearAllMocks()
  derive.mockImplementation(async ({ sourceStorageKey }) =>
    assetsFor(sourceStorageKey),
  )
  const user = await createTestUser()
  userId = user.id
})

describe('image-preview-derivative.service', () => {
  it('入队：一条待办的派生任务，载荷只记 generation 与原图 key', async () => {
    const { generation, outbox, generationJobId } = await enqueue('a')

    const row = await db.executionOutbox.findUniqueOrThrow({
      where: { id: outbox.id },
    })
    expect(row).toMatchObject({
      generationJobId,
      kind: EXECUTION_OUTBOX_KINDS.IMAGE_PREVIEW_DERIVATIVES,
      status: 'PENDING',
      payload: {
        generationId: generation.id,
        sourceStorageKey: generation.storageKey,
      },
    })
  })

  it('处理：派生图写回 generation，任务完成', async () => {
    const { generation, outbox } = await enqueue('a')

    const result = await processImagePreviewDerivativeOutbox(outbox.id)

    expect(result).toEqual({
      outboxId: outbox.id,
      status: 'completed',
      generationId: generation.id,
    })
    // 只传 key：Worker 直接从桶里读原图。
    expect(derive).toHaveBeenCalledWith({
      sourceStorageKey: generation.storageKey,
    })
    const updated = await db.generation.findUniqueOrThrow({
      where: { id: generation.id },
    })
    expect(updated).toMatchObject(assetsFor(generation.storageKey))
    const row = await db.executionOutbox.findUniqueOrThrow({
      where: { id: outbox.id },
    })
    expect(row.status).toBe('COMPLETED')
  })

  it('早期入队、载荷里还带 sourceUrl 的任务照样处理', async () => {
    const generation = await seedImage('legacy')
    const outbox = await db.executionOutbox.create({
      data: {
        generationJobId: await seedJob(),
        kind: EXECUTION_OUTBOX_KINDS.IMAGE_PREVIEW_DERIVATIVES,
        payload: {
          generationId: generation.id,
          sourceUrl: generation.url,
          sourceStorageKey: generation.storageKey,
        },
      },
    })

    const result = await processImagePreviewDerivativeOutbox(outbox.id)

    expect(result).toMatchObject({
      status: 'completed',
      generationId: generation.id,
    })
    const updated = await db.generation.findUniqueOrThrow({
      where: { id: generation.id },
    })
    expect(updated.previewUrl).toBe(assetsFor(generation.storageKey).previewUrl)
  })

  it('临时失败且还有重试次数：退回待办，generation 不动', async () => {
    const { generation, outbox } = await enqueue('a')
    derive.mockRejectedValueOnce(
      new Error('Image derivatives failed (502): R2 temporarily unavailable'),
    )

    const result = await processImagePreviewDerivativeOutbox(outbox.id)

    expect(result).toMatchObject({
      outboxId: outbox.id,
      status: 'retrying',
      generationId: generation.id,
    })
    const row = await db.executionOutbox.findUniqueOrThrow({
      where: { id: outbox.id },
    })
    expect(row.status).toBe('PENDING')
    expect(row.lastError).toContain('R2 temporarily unavailable')
    const untouched = await db.generation.findUniqueOrThrow({
      where: { id: generation.id },
    })
    expect(untouched.previewUrl).toBeNull()
  })

  it('第三次还失败：任务停在 FAILED，不再重试', async () => {
    const { outbox } = await enqueue('a')
    derive.mockRejectedValue(new Error('Image derivatives failed (502)'))

    const statuses = []
    for (let i = 0; i < 3; i++) {
      statuses.push(
        (await processImagePreviewDerivativeOutbox(outbox.id)).status,
      )
    }

    expect(statuses).toEqual(['retrying', 'retrying', 'failed'])
    const row = await db.executionOutbox.findUniqueOrThrow({
      where: { id: outbox.id },
    })
    expect(row.status).toBe('FAILED')
    expect(row.attemptCount).toBe(3)
  })

  it('批量处理：按入队先后，只取 limit 条', async () => {
    const first = await enqueue('first')
    const second = await enqueue('second')
    const third = await enqueue('third')

    const results = await processPendingImagePreviewDerivativeOutboxes({
      limit: 2,
    })

    expect(results.map((r) => r.generationId)).toEqual([
      first.generation.id,
      second.generation.id,
    ])
    const left = await db.executionOutbox.findUniqueOrThrow({
      where: { id: third.outbox.id },
    })
    expect(left.status).toBe('PENDING')
  })
})
