/**
 * L2a 真库：图片转换接口（/api/image-transform）。只假边界：Clerk 登录、限流、执行 Worker（fetch）。
 * 服务里各转换类型的分流在 `src/services/image/image-transform.service.int.test.ts` 测；这里只测接口这一层的把关。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  createPOST,
  mockAuthenticated,
  mockRateLimitAllowed,
  parseJSON,
} from '@/test/api-helpers'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { POST } from '@/app/api/image-transform/route'
import { db } from '@/lib/db'
import { createTestUser, resetDatabase, seedAssistantKey } from '@/test/int/db'
import {
  installFakeExecutionWorker,
  settlePolling,
} from '@/test/int/execution-worker'
import type { TransformOutput } from '@/types/transform'

const BODY = {
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
  mockAuthenticated(me.clerkId)
  mockRateLimitAllowed()
  installFakeExecutionWorker({ autoFinish: () => 'image' })
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('POST /api/image-transform', () => {
  it.each([
    ['还没做的转换类型', { transformation: { type: 'background' } }],
    ['上传主体却没给图', { subject: { type: 'upload' } }],
  ])('%s：400，⛔ 建任务', async (_label, patch) => {
    const res = await POST(
      createPOST('/api/image-transform', { ...BODY, ...patch }),
    )

    expect(res.status).toBe(400)
    expect(await db.generationJob.count()).toBe(0)
  })

  it('交回整份结果：原图 + 每张变体各自的状态', async () => {
    const res = await settlePolling(
      POST(createPOST('/api/image-transform', BODY)),
    )
    const json = await parseJSON<{ success: boolean; data: TransformOutput }>(
      res,
    )

    expect(res.status).toBe(200)
    expect(json.data.original.url).toBe('https://cdn.test/subject.png')
    expect(json.data.variants).toHaveLength(1)
  })
})
