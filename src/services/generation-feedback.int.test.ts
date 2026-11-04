/**
 * L2a 真库：生成后的对话式改词（generation-feedback.service）。用户 key 真加密入库、
 * 助手选的型号存在真的 AssistantPersona 里，路由真选、key 真解密；只假文本模型（llm-text.service）。
 * 核交给模型的是哪家、哪个型号、哪把 key。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const llm = vi.hoisted(() => ({
  calls: [] as Array<Record<string, unknown>>,
}))
vi.mock('@/services/llm-text.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/llm-text.service')>()),
  llmTextCompletion: async (input: Record<string, unknown>) => {
    llm.calls.push(input)
    return JSON.stringify({
      reply: 'What would you like to change?',
      refinedPrompt: null,
      negativeAdditions: [],
      done: false,
    })
  },
}))

import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { db } from '@/lib/db'
import { AssistantModelCannotSeeError } from '@/lib/errors'
import { conversationalRefine } from '@/services/generation-feedback.service'
import { createTestUser, resetDatabase, seedAssistantKey } from '@/test/int/db'

const USER_KEY = 'sk-test-not-a-real-key'
const IMAGE = 'https://cdn.test/a.png'

let me: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
  llm.calls = []
})

const pickModel = (routeModel: string) =>
  db.assistantPersona.create({ data: { userId: me.id, routeModel } })

describe('conversationalRefine（真库路由）', () => {
  it('没点名 key：走助手选的那一家那个型号（不是顺序里排第一的 Gemini）', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.GEMINI)
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.XAI)
    await pickModel(LLM_TEXT_MODEL_IDS.XAI_GROK_4_7)

    const result = await conversationalRefine(
      me.clerkId,
      IMAGE,
      'a cat',
      [],
      'en',
    )
    expect(result.reply).toBe('What would you like to change?')
    expect(llm.calls).toHaveLength(1)
    expect(llm.calls[0]).toMatchObject({
      adapterType: AI_ADAPTER_TYPES.XAI,
      modelId: LLM_TEXT_MODEL_IDS.XAI_GROK_4_7,
      apiKey: USER_KEY,
    })
  })

  it('助手选的 DeepSeek V4 Pro 看不了图：照实抛，不借能看图的那一家', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.GEMINI)
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.DEEPSEEK)
    await pickModel(LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_PRO)

    await expect(
      conversationalRefine(me.clerkId, IMAGE, 'a cat', [], 'en'),
    ).rejects.toBeInstanceOf(AssistantModelCannotSeeError)
    expect(llm.calls).toHaveLength(0)
  })

  it('点名了一把 key：就用它', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.GEMINI)
    const openai = await seedAssistantKey(me.id, AI_ADAPTER_TYPES.OPENAI)

    await conversationalRefine(me.clerkId, IMAGE, 'a cat', [], 'en', openai.id)
    expect(llm.calls).toHaveLength(1)
    expect(llm.calls[0]).toMatchObject({
      adapterType: AI_ADAPTER_TYPES.OPENAI,
      apiKey: USER_KEY,
    })
  })
})
