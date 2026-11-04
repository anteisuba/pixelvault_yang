/**
 * L2a 真库 + 真提交链路：风格转换按预设出 N 张。只假执行 Worker（fetch），Worker 的回执走真回执服务。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { getTransformPresetById } from '@/constants/transform-presets'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { db } from '@/lib/db'
import { createTestUser, resetDatabase, seedAssistantKey } from '@/test/int/db'
import {
  installFakeExecutionWorker,
  settlePolling,
  type FakeExecutionWorker,
} from '@/test/int/execution-worker'
import { TransformInputSchema } from '@/types/transform'

import { handleStyleTransform } from './handle-style-transform'

let me: Awaited<ReturnType<typeof createTestUser>>
let worker: FakeExecutionWorker

const watercolor = (variants: number) =>
  TransformInputSchema.parse({
    input: { data: 'https://cdn.test/subject.png' },
    subject: { imageData: 'https://cdn.test/subject.png' },
    style: { type: 'preset', presetId: 'preset-watercolor' },
    transformation: { type: 'style' },
    variants,
  })

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  await seedAssistantKey(me.id, AI_ADAPTER_TYPES.FAL)
  worker = installFakeExecutionWorker({ autoFinish: () => 'image' })
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('handleStyleTransform', () => {
  /**
   * ⚠ 真 bug：预设全部指向 `fal-ai/flux-pro/redux`，它不在内置型号目录里，按「自定义型号」
   * 选路就必须带 apiKeyId；而这里提交时一个 key 都不带 → 每张都被拒
   * （"Custom models require selecting an active API key"）。修好后去掉 `.fails`。
   */
  it.fails(
    '预设：按预设的型号出图，四张变体各建一个任务、各落一张图',
    async () => {
      const preset = getTransformPresetById('preset-watercolor')!

      const output = await settlePolling(
        handleStyleTransform(me.clerkId, watercolor(4)),
      )

      expect(output.variants.map((v) => v.status)).toEqual(
        Array(4).fill('success'),
      )
      expect(output.totalCost).toBe(4)
      const jobs = await db.generationJob.findMany({ where: { userId: me.id } })
      expect(jobs).toHaveLength(4)
      expect(jobs.every((job) => job.modelId === preset.modelId)).toBe(true)
      expect(worker.requests).toHaveLength(4)
      expect(await db.generation.count({ where: { userId: me.id } })).toBe(4)
    },
  )

  it('出不来的那几张各自记成可重试的失败，原因照实带上，⛔ 不计费', async () => {
    const output = await settlePolling(
      handleStyleTransform(me.clerkId, watercolor(1)),
    )

    expect(output.totalCost).toBe(0)
    expect(output.variants).toEqual([
      {
        status: 'failed',
        error: expect.objectContaining({
          retryable: true,
          i18nKey: expect.any(String),
          displayMessage: expect.any(String),
        }),
      },
    ])
    expect(output.original.url).toBe('https://cdn.test/subject.png')
  })

  it('风格卡已下线：style_card 过不了请求校验', () => {
    const parsed = TransformInputSchema.safeParse({
      input: { data: 'https://cdn.test/subject.png' },
      subject: { imageData: 'https://cdn.test/subject.png' },
      style: { type: 'style_card', cardId: 'style_1' },
      transformation: { type: 'style' },
      variants: 1,
    })
    expect(parsed.success).toBe(false)
  })
})
