/**
 * L2a 真库：Seedance 分镜提示词规划（/api/studio/seedance-prompt-plan）。
 * 只假边界：Clerk 登录、限流、LLM 入口。选哪把 key 走真库：核发给 LLM 的 key、提示词与返回值。
 * ⚠ 模型回的不合规会退避 800ms 再试（真等），这里不测那条。
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
  mockUnauthenticated,
  parseJSON,
} from '@/test/api-helpers'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { POST } from '@/app/api/studio/seedance-prompt-plan/route'
import { createTestUser, resetDatabase, seedAssistantKey } from '@/test/int/db'

type Envelope<T> = { success: boolean; data?: T; errorCode?: string }

const PLAN = {
  title: 'Signal Rain',
  visualDescription: 'A lone antenna pulses in a rainy neon alley.',
  timeline: [
    {
      startSecond: 0,
      endSecond: 4,
      action: 'The antenna flickers while rain streaks down metal.',
      camera: 'Slow push-in from street level.',
    },
  ],
  motion: 'Rainfall, signal pulse, slow push-in.',
  camera: 'Low-angle cinematic push-in.',
  duration: '8s',
  audioIntent: 'Rain, low electric hum, no music.',
  finalPrompt:
    'A lone antenna pulses in a rainy neon alley. 0-4s: slow push-in from street level.',
  copyRisk: 'low',
}

let me: Awaited<ReturnType<typeof createTestUser>>
let other: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  other = await createTestUser()
  mockAuthenticated(me.clerkId)
  mockRateLimitAllowed()
  llm.reply = JSON.stringify(PLAN)
  llm.calls = []
})

async function plan(body: Record<string, unknown>) {
  const res = await POST(
    createPOST('/api/studio/seedance-prompt-plan', {
      idea: 'rain signal',
      plannerProvider: 'auto',
      locale: 'en',
      ...body,
    }),
  )
  return {
    status: res.status,
    body: await parseJSON<
      Envelope<{ plan: typeof PLAN; planner: { adapterType: string } }>
    >(res),
  }
}

describe('POST /api/studio/seedance-prompt-plan（真库选 key）', () => {
  it('用我存的 key 规划，参考图槽位写进提示词，回校验过的计划', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.GEMINI)
    const res = await plan({
      references: {
        images: [{ index: 1, name: 'Mika', kind: 'character' }],
        videoCount: 0,
        audio: [],
      },
    })
    expect(res.status).toBe(200)
    expect(res.body.data!.plan).toMatchObject({
      title: 'Signal Rain',
      timeline: [{ startSecond: 0, endSecond: 4 }],
    })
    expect(res.body.data!.planner.adapterType).toBe(AI_ADAPTER_TYPES.GEMINI)

    expect(llm.calls).toHaveLength(1)
    expect(llm.calls[0]).toMatchObject({
      purpose: 'seedance-prompt-plan',
      responseFormat: 'json_object',
      apiKey: 'sk-test-not-a-real-key',
    })
    const userPrompt = String(llm.calls[0].userPrompt)
    expect(userPrompt).toContain('User idea: rain signal')
    expect(userPrompt).toContain('@Image1 = "Mika" (character)')
  })

  it('点名别人的 key：不用、不调 LLM', async () => {
    const theirs = await seedAssistantKey(other.id, AI_ADAPTER_TYPES.GEMINI)
    const res = await plan({ apiKeyId: theirs.id })
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(llm.calls).toHaveLength(0)
  })

  it('没有想法 400；没登录 401；都不调 LLM', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.GEMINI)
    expect((await plan({ idea: '' })).status).toBe(400)
    mockUnauthenticated()
    expect((await plan({})).status).toBe(401)
    expect(llm.calls).toHaveLength(0)
  })
})
