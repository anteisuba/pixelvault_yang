/**
 * L2a 真库：角色试读 / 起草（「全跟助手」，owner 2026-10-15）。
 * 卡、key（真加密）、助手选的那一档都在真库里，路由走真 `resolveAssistantRoute`；
 * 只假文字模型那一跳，断言它收到的提示词、那一家、那把 key。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const llmTextCompletion = vi.hoisted(() => vi.fn())
vi.mock('@/services/llm-text.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/llm-text.service')>()),
  llmTextCompletion,
}))

import { ASSISTANT_OPERATOR_MODEL_KEY_MISSING_CODE } from '@/constants/assistant-operator'
import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { db } from '@/lib/db'
import type { Prisma } from '@/lib/generated/prisma/client'
import { createTestCard } from '@/test/int/cards'
import { createTestUser, resetDatabase, seedAssistantKey } from '@/test/int/db'

import {
  draftCharacterDialogue,
  sampleCharacterLines,
} from './character-sample-lines.service'

const PLAIN_KEY = 'sk-test-not-a-real-key'

let me: Awaited<ReturnType<typeof createTestUser>>
let cardId: string

beforeEach(async () => {
  llmTextCompletion.mockReset()
  await resetDatabase()
  me = await createTestUser()
})

async function seedCard(persona: Record<string, unknown>) {
  cardId = (
    await createTestCard(me.id, {
      name: 'Denia',
      persona: persona as Prisma.InputJsonValue,
    })
  ).id
}

describe('sampleCharacterLines（试读）', () => {
  beforeEach(async () => {
    await seedCard({ speech: '叫对方「指挥官」', catchphrases: ['呢'] })
  })

  it('把设定写进提示，读回两句', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.GEMINI)
    llmTextCompletion.mockResolvedValue(
      '```json\n{"lines": ["指挥官，看着我呢。", "嘘——秘密。"]}\n```',
    )
    await expect(sampleCharacterLines(me.clerkId, cardId)).resolves.toEqual({
      lines: ['指挥官，看着我呢。', '嘘——秘密。'],
    })
    const [input] = llmTextCompletion.mock.calls[0]!
    expect(input.userPrompt).toContain('Way of speaking: 叫对方「指挥官」')
    expect(input.userPrompt).toContain('Catchphrases: 呢')
  })

  it('不是本人的卡返回 null（不问模型）；模型没回 JSON 就报错', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.GEMINI)
    const other = await createTestUser()
    const theirs = await createTestCard(other.id)
    await expect(
      sampleCharacterLines(me.clerkId, theirs.id),
    ).resolves.toBeNull()
    expect(llmTextCompletion).not.toHaveBeenCalled()

    llmTextCompletion.mockResolvedValue('我不知道')
    await expect(sampleCharacterLines(me.clerkId, cardId)).rejects.toThrow()
  })

  it('「自动」挑的那一家（DeepSeek）连型号一起用，只发给它、用它的 key', async () => {
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.ANTHROPIC)
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.DEEPSEEK)
    llmTextCompletion.mockResolvedValue('{"lines": ["指挥官。"]}')

    await sampleCharacterLines(me.clerkId, cardId)

    expect(llmTextCompletion).toHaveBeenCalledTimes(1)
    expect(llmTextCompletion.mock.calls[0]?.[0]).toMatchObject({
      adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
      apiKey: PLAIN_KEY,
      modelId: LLM_TEXT_MODEL_IDS.DEEPSEEK_FLASH,
    })
  })

  it('选了 Claude 却只有 Gemini 的 key → 照实报缺 key，一个字都没发给 Gemini', async () => {
    await db.assistantPersona.create({
      data: { userId: me.id, routeModel: LLM_TEXT_MODEL_IDS.CLAUDE_SONNET_5_5 },
    })
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.GEMINI)

    await expect(
      sampleCharacterLines(me.clerkId, cardId),
    ).rejects.toMatchObject({
      errorCode: ASSISTANT_OPERATOR_MODEL_KEY_MISSING_CODE,
      i18nKey: 'errors.assistant.modelKeyMissing',
    })
    expect(llmTextCompletion).not.toHaveBeenCalled()
  })
})

describe('draftCharacterDialogue（起草）', () => {
  beforeEach(async () => {
    await seedCard({ speech: '叫对方「指挥官」', boundaries: '不戴防护面罩' })
    await seedAssistantKey(me.id, AI_ADAPTER_TYPES.GEMINI)
  })

  it('对话示例：读回几段问答，「不会做的事」也进提示', async () => {
    llmTextCompletion.mockResolvedValue(
      '{"examples": [{"user": "早", "reply": "指挥官，早呀。"}, {"reply": "才不要。"}]}',
    )
    await expect(
      draftCharacterDialogue(me.clerkId, cardId, 'examples'),
    ).resolves.toEqual({
      examples: [
        { user: '早', reply: '指挥官，早呀。' },
        { user: '', reply: '才不要。' },
      ],
    })
    const [input] = llmTextCompletion.mock.calls[0]!
    expect(input.userPrompt).toContain(
      "What they won't do, and their flaws: 不戴防护面罩",
    )
    expect(input).toMatchObject({
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      apiKey: PLAIN_KEY,
    })
  })

  it('开场白：读回一句；不是本人的卡返回 null；没回 JSON 就报错', async () => {
    llmTextCompletion.mockResolvedValue('{"opening": "嘘……请你不要声张。"}')
    await expect(
      draftCharacterDialogue(me.clerkId, cardId, 'opening'),
    ).resolves.toEqual({ opening: '嘘……请你不要声张。' })

    await expect(
      draftCharacterDialogue(me.clerkId, 'missing', 'opening'),
    ).resolves.toBeNull()

    llmTextCompletion.mockResolvedValue('{"lines": ["x"]}')
    await expect(
      draftCharacterDialogue(me.clerkId, cardId, 'opening'),
    ).rejects.toThrow()
  })
})
