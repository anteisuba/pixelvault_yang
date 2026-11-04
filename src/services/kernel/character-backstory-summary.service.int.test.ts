import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const mockCompletion = vi.fn()
vi.mock('@/services/llm-text.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/llm-text.service')>()),
  llmTextCompletion: (...a: unknown[]) => mockCompletion(...a),
}))

import { createHash } from 'node:crypto'

import {
  ASSISTANT_PERSONA_DEFAULTS,
  ASSISTANT_PERSONA_LIMITS,
} from '@/constants/assistant-persona'
import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { db } from '@/lib/db'
import { plainKeyOf, seedAssistantKeys } from '@/test/int/assistant-keys'
import { createTestUser, resetDatabase } from '@/test/int/db'
import type { AssistantPromptPersona } from '@/types/assistant-persona'

import { withSummarizedBackstory } from './character-backstory-summary.service'

/**
 * 长经历先总结（真库 L2a）：卡上存的总结、助手那一家的 key 都是真库里的行；
 * 只有模型那一跳（`llmTextCompletion`）在边界上假。
 */
const LONG = '她在雾港长大。'.repeat(400)
const hash = (text: string) => createHash('sha256').update(text).digest('hex')

function persona(cardId: string, backstory: string): AssistantPromptPersona {
  return {
    ...ASSISTANT_PERSONA_DEFAULTS,
    characterCardId: cardId,
    promptCharacter: {
      name: 'Denia',
      identity: '',
      behavior: '',
      speech: '',
      boundaries: '',
      catchphrases: [],
      backstory,
    },
  }
}

async function setup(extensions: object | null = null) {
  const user = await createTestUser()
  await seedAssistantKeys(user.id, {
    keys: [{ adapterType: AI_ADAPTER_TYPES.DEEPSEEK }],
    routeModel: LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_PRO,
  })
  const card = await db.characterCard.create({
    data: {
      userId: user.id,
      name: 'Denia',
      ...(extensions ? { extensions } : {}),
    },
  })
  const extensionsNow = async () =>
    (await db.characterCard.findUniqueOrThrow({ where: { id: card.id } }))
      .extensions
  return { user, card, extensionsNow }
}

describe('withSummarizedBackstory（长经历先总结，真库）', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await resetDatabase()
  })

  it('没超上限：原文照用，不调模型', async () => {
    const { user, card } = await setup()
    const input = persona(card.id, '短经历')
    expect(await withSummarizedBackstory(user.id, input)).toBe(input)
    expect(mockCompletion).not.toHaveBeenCalled()
  })

  it('存过且哈希对得上：直接用存的那份，不调模型', async () => {
    const { user, card } = await setup({
      'pv.backstorySummary': { hash: hash(LONG), text: '存好的总结' },
    })
    const out = await withSummarizedBackstory(user.id, persona(card.id, LONG))
    expect(out.promptCharacter?.backstory).toBe('存好的总结')
    expect(mockCompletion).not.toHaveBeenCalled()
  })

  it('经历改了（哈希不符）：用助手那一家的便宜档重算，存回卡上、别的扩展键不丢', async () => {
    const { user, card, extensionsNow } = await setup({
      'pv.tags': { character: [] },
      'pv.backstorySummary': { hash: 'old', text: '旧总结' },
    })
    mockCompletion.mockResolvedValue('新总结')

    const out = await withSummarizedBackstory(user.id, persona(card.id, LONG))

    expect(out.promptCharacter?.backstory).toBe('新总结')
    expect(mockCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
        apiKey: plainKeyOf(AI_ADAPTER_TYPES.DEEPSEEK),
        modelId: LLM_TEXT_MODEL_IDS.DEEPSEEK_FLASH,
      }),
    )
    expect(await extensionsNow()).toEqual({
      'pv.tags': { character: [] },
      'pv.backstorySummary': { hash: hash(LONG), text: '新总结' },
    })
  })

  it('别人的卡：不读、不调模型、不写', async () => {
    const { card, extensionsNow } = await setup()
    const stranger = await createTestUser()
    const input = persona(card.id, LONG)

    expect(await withSummarizedBackstory(stranger.id, input)).toBe(input)
    expect(mockCompletion).not.toHaveBeenCalled()
    expect(await extensionsNow()).toBeNull()
  })

  it('总结超长也只留上限以内', async () => {
    const { user, card } = await setup()
    mockCompletion.mockResolvedValue('长'.repeat(5000))
    const out = await withSummarizedBackstory(user.id, persona(card.id, LONG))
    expect(out.promptCharacter?.backstory.length).toBe(
      ASSISTANT_PERSONA_LIMITS.maxCharacterBackstoryChars,
    )
  })

  it('总结失败：这一轮照旧（后面截断），不报错、卡上不写', async () => {
    const { user, card, extensionsNow } = await setup()
    mockCompletion.mockRejectedValue(new Error('no key'))
    const input = persona(card.id, LONG)
    expect(await withSummarizedBackstory(user.id, input)).toBe(input)
    expect(await extensionsNow()).toBeNull()
  })
})
