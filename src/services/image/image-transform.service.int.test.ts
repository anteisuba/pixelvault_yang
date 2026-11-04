/**
 * L2a 真库 + 真提交链路：图片转换总入口按转换类型分流。只假执行 Worker（fetch），回执走真回执服务。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { DIMENSION_PROVIDERS } from '@/constants/transform-dimensions'
import { NotImplementedError } from '@/lib/errors'
import { db } from '@/lib/db'
import { transformImage } from '@/services/image/image-transform.service'
import { createTestUser, resetDatabase, seedAssistantKey } from '@/test/int/db'
import {
  installFakeExecutionWorker,
  settlePolling,
} from '@/test/int/execution-worker'
import type { TransformInput } from '@/types/transform'

const INPUT: TransformInput = {
  input: { type: 'image', data: 'https://cdn.test/subject.png' },
  subject: { type: 'upload', imageData: 'https://cdn.test/subject.png' },
  style: { type: 'preset', presetId: 'preset-watercolor' },
  transformation: { type: 'style' },
  preservation: { structure: 0.7, text: 0.9, composition: 0.6, people: 0.7 },
  variants: 1,
}

let me: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  await seedAssistantKey(me.id, AI_ADAPTER_TYPES.FAL)
  installFakeExecutionWorker({ autoFinish: () => 'image' })
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('transformImage', () => {
  it.each(['background', 'garment', 'detail'] as const)(
    '%s 还没做：直接说没实现，⛔ 不建任务',
    async (type) => {
      await expect(
        transformImage(me.clerkId, { ...INPUT, transformation: { type } }),
      ).rejects.toThrow(NotImplementedError)
      await expect(
        transformImage(me.clerkId, { ...INPUT, transformation: { type } }),
      ).rejects.toThrow(`${type} transformation`)
      expect(await db.generationJob.count()).toBe(0)
    },
  )

  /**
   * ⚠ 真 bug（同 handle-style-transform.int.test.ts）：风格与姿势两条都用
   * `fal-ai/flux-pro/redux`，它不在内置目录里、提交又不带 apiKeyId → 选路就被拒，一张都出不来。
   * 修好后去掉 `.fails`。
   */
  it.fails.each([
    ['style', 'fal-ai/flux-pro/redux'],
    ['pose', DIMENSION_PROVIDERS.pose.defaultModelId],
  ] as const)('%s：按那一类的型号出图', async (type, modelId) => {
    const output = await settlePolling(
      transformImage(me.clerkId, { ...INPUT, transformation: { type } }),
    )

    expect(output.variants[0]?.status).toBe('success')
    const job = await db.generationJob.findFirstOrThrow({
      where: { userId: me.id },
    })
    expect(job.modelId).toBe(modelId)
  })

  it.each(['style', 'pose'] as const)(
    '%s：出不来时整份结果照样交回，失败那张可重试',
    async (type) => {
      const output = await settlePolling(
        transformImage(me.clerkId, { ...INPUT, transformation: { type } }),
      )
      expect(output.original.url).toBe('https://cdn.test/subject.png')
      expect(output.variants).toEqual([
        expect.objectContaining({
          status: 'failed',
          error: expect.objectContaining({ retryable: true }),
        }),
      ])
    },
  )
})
