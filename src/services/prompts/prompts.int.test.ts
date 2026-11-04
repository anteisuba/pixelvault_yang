/**
 * L2a 真库：提示词小功能——提示词点评（走助手那一家的真路由）、标签栈存取。
 * 只假边界：文字模型那一跳（llm-text）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const llm = vi.hoisted(() => ({ completion: vi.fn() }))
vi.mock('@/services/llm-text.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/llm-text.service')>()),
  llmTextCompletion: llm.completion,
}))

import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { db } from '@/lib/db'
import { getPromptFeedback } from '@/services/prompts/prompt-feedback.service'
import {
  getPromptTagStack,
  savePromptTagStack,
} from '@/services/prompts/prompt-tag-stack.service'
import { createTestUser, resetDatabase, seedAssistantKey } from '@/test/int/db'

const VALID_FEEDBACK_JSON = JSON.stringify({
  overallAssessment: 'A solid prompt with good subject clarity.',
  suggestions: [
    {
      category: 'Lighting',
      suggestion: 'Specify the time of day.',
      example: 'golden hour lighting',
    },
  ],
  improvedPrompt: 'a cat sitting under a tree, golden hour lighting',
})

beforeEach(async () => {
  await resetDatabase()
  llm.completion.mockReset()
})

describe('提示词点评', () => {
  it('正常回结构化点评', async () => {
    const user = await createTestUser()
    await seedAssistantKey(user.id, AI_ADAPTER_TYPES.GEMINI)
    llm.completion.mockResolvedValue(VALID_FEEDBACK_JSON)

    const result = await getPromptFeedback(user.clerkId, 'a cat under a tree')

    expect(result.overallAssessment).toContain('solid')
    expect(result.suggestions).toHaveLength(1)
    expect(result.improvedPrompt).toContain('golden hour')
    expect(result.originalPrompt).toBe('a cat under a tree')
  })

  it('模型回的 JSON 不合格式：回兜底点评，原提示词不动', async () => {
    const user = await createTestUser()
    await seedAssistantKey(user.id, AI_ADAPTER_TYPES.GEMINI)
    llm.completion.mockResolvedValue(JSON.stringify({ message: 'no schema' }))

    const result = await getPromptFeedback(user.clerkId, 'a cat under a tree')

    expect(result.improvedPrompt).toBe('a cat under a tree')
    expect(result.suggestions[0]?.category).toBe('General')
  })

  it('⭐ 没点名 key = 助手那一家、那个型号（⛔ 不是先配的 Gemini）', async () => {
    const user = await createTestUser()
    await seedAssistantKey(user.id, AI_ADAPTER_TYPES.GEMINI)
    await seedAssistantKey(user.id, AI_ADAPTER_TYPES.DEEPSEEK)
    await db.assistantPersona.create({
      data: {
        userId: user.id,
        routeModel: LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_PRO,
      },
    })
    llm.completion.mockResolvedValue(VALID_FEEDBACK_JSON)

    await getPromptFeedback(user.clerkId, 'a cat under a tree')

    expect(llm.completion).toHaveBeenCalledTimes(1)
    expect(llm.completion).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
        modelId: LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_PRO,
        apiKey: 'sk-test-not-a-real-key',
      }),
    )
  })
})

describe('标签栈', () => {
  const selection = {
    id: 's1',
    tagId: 'danbooru:smile',
    promptText: 'smile',
    label: 'smile',
    polarity: 'positive' as const,
    source: 'danbooru' as const,
    type: 'character_trait' as const,
    enabled: true,
    orderIndex: 0,
    insertedAt: '2026-10-01T00:00:00.000Z',
  }

  it('没存过回 null；存了读回来一样；再存覆盖、不多一行', async () => {
    const user = await createTestUser()
    expect(await getPromptTagStack(user.clerkId)).toBeNull()

    await savePromptTagStack(user.clerkId, {
      positive: [selection],
      negative: [],
    })
    expect(await getPromptTagStack(user.clerkId)).toEqual({
      positive: [selection],
      negative: [],
    })

    await savePromptTagStack(user.clerkId, {
      positive: [],
      negative: [{ ...selection, polarity: 'negative' as const }],
    })
    expect((await getPromptTagStack(user.clerkId))?.negative).toHaveLength(1)
    expect(await db.promptTagStack.count({ where: { userId: user.id } })).toBe(
      1,
    )
  })

  it('坏掉的条目丢掉，不让整次读取失败；别人的读不到', async () => {
    const user = await createTestUser()
    const stranger = await createTestUser()
    await db.promptTagStack.create({
      data: {
        userId: user.id,
        positive: [selection, { id: 'bad' }],
        negative: 'not-an-array',
      },
    })

    expect(await getPromptTagStack(user.clerkId)).toEqual({
      positive: [selection],
      negative: [],
    })
    expect(await getPromptTagStack(stranger.clerkId)).toBeNull()
  })
})
