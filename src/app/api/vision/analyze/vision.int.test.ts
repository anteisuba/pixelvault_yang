/**
 * L2a 真库：结构化看图（/api/vision/analyze）。只假边界：Clerk 登录、限流、LLM 入口。
 * 选哪条路、用哪把 key、ResearchRun 落库都走真的：核发给 LLM 的东西、库里那一行与返回值。
 * ⚠ 模型回的不合规会退避 800ms 再试一次（真等），这里不测那条，见 vision-structured-output 单测。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const llm = vi.hoisted(() => ({
  reply: '',
  calls: [] as Array<Record<string, unknown>>,
}))
vi.mock('@/services/llm-text.service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/services/llm-text.service')>()
  return {
    ...actual,
    llmTextCompletion: vi.fn(async (input: Record<string, unknown>) => {
      llm.calls.push(input)
      return llm.reply
    }),
  }
})

import {
  createPOST,
  mockAuthenticated,
  mockRateLimitAllowed,
  mockRateLimitExceeded,
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { VISION_TASKS } from '@/constants/vision'
import { ASSISTANT_SURFACE_IDS } from '@/types/assistant-conversation'
import { POST } from '@/app/api/vision/analyze/route'
import { db } from '@/lib/db'
import { createTestUser, resetDatabase, seedAssistantKey } from '@/test/int/db'

type Envelope<T> = { success: boolean; data?: T; errorCode?: string }

const IMAGE_A = 'https://cdn.test.com/a.png'
const IMAGE_B = 'https://cdn.test.com/b.png'

const COMPARE = {
  differences: [
    {
      aspect: 'hands',
      perImage: [
        { imageIndex: 0, text: 'left hand raised' },
        { imageIndex: 1, text: 'both hands down' },
      ],
      basis: 'observation',
    },
  ],
  shared: [
    { label: 'lighting', text: 'soft window light', basis: 'observation' },
  ],
  uncertainties: [],
}

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
  mockAuthenticated(me.clerkId)
  mockRateLimitAllowed()
  llm.reply = JSON.stringify(COMPARE)
  llm.calls = []
})

async function analyze(body: Record<string, unknown>) {
  const res = await POST(
    createPOST('/api/vision/analyze', {
      task: VISION_TASKS.compare,
      mediaUrls: [IMAGE_A, IMAGE_B],
      surface: ASSISTANT_SURFACE_IDS.imageStudio,
      ...body,
    }),
  )
  return {
    status: res.status,
    body: await parseJSON<
      Envelope<{ runId: string | null; observations: unknown }>
    >(res),
  }
}

describe('POST /api/vision/analyze（真库）', () => {
  it('点名我的 key：两张图发给模型，观察回来并落一条 ResearchRun', async () => {
    const key = await seedAssistantKey(me.id, AI_ADAPTER_TYPES.GEMINI)
    const res = await analyze({
      apiKeyId: key.id,
      instruction: 'focus on the hands',
    })
    expect(res.status).toBe(200)
    expect(res.body.data!.observations).toMatchObject({
      task: VISION_TASKS.compare,
      differences: [{ aspect: 'hands' }],
    })

    expect(llm.calls).toHaveLength(1)
    expect(llm.calls[0]).toMatchObject({
      imageData: [IMAGE_A, IMAGE_B],
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      apiKey: 'sk-test-not-a-real-key',
    })
    expect(String(llm.calls[0].userPrompt)).toContain('focus on the hands')

    const run = await db.researchRun.findUniqueOrThrow({
      where: { id: res.body.data!.runId! },
    })
    expect(run).toMatchObject({
      userId: me.id,
      status: 'succeeded',
      grounded: false,
      surface: ASSISTANT_SURFACE_IDS.imageStudio,
    })
  })

  it('不点名：跟助手那一家走；一把 key 都没有 400，不调 LLM', async () => {
    expect((await analyze({})).status).toBe(400)
    expect(llm.calls).toHaveLength(0)

    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.DEEPSEEK)
    expect((await analyze({})).status).toBe(200)
    expect(llm.calls).toHaveLength(1)
    expect(llm.calls[0]).toMatchObject({
      adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
    })
  })

  it('点名的是别人的 key：不用、不调 LLM、不落库', async () => {
    const theirs = await seedAssistantKey(other.id, AI_ADAPTER_TYPES.GEMINI)
    expect(
      (await analyze({ apiKeyId: theirs.id })).status,
    ).toBeGreaterThanOrEqual(400)
    expect(llm.calls).toHaveLength(0)
    expect(await db.researchRun.count()).toBe(0)
  })

  it('compare 只给一张 / data: 地址 400；限流 429；没登录 401', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.GEMINI)
    expect((await analyze({ mediaUrls: [IMAGE_A] })).status).toBe(400)
    expect(
      (await analyze({ mediaUrls: [IMAGE_A, 'data:image/png;base64,AA'] }))
        .status,
    ).toBe(400)
    mockRateLimitExceeded()
    expect((await analyze({})).status).toBe(429)
    mockUnauthenticated()
    expect((await analyze({})).status).toBe(401)
    expect(llm.calls).toHaveLength(0)
    expect(await db.researchRun.count()).toBe(0)
  })
})
