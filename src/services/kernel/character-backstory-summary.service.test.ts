import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const mockFindFirst = vi.fn()
const mockUpdate = vi.fn()
const mockCompletion = vi.fn()
const mockResolveRoute = vi.fn()
vi.mock('@/lib/db', () => ({
  db: {
    characterCard: {
      findFirst: (...a: unknown[]) => mockFindFirst(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
    },
  },
}))
vi.mock('@/services/kernel/assistant-route.service', () => ({
  resolveAssistantRoute: (...a: unknown[]) => mockResolveRoute(...a),
}))
vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: (...a: unknown[]) => mockCompletion(...a),
}))

import { createHash } from 'node:crypto'

import {
  ASSISTANT_PERSONA_DEFAULTS,
  ASSISTANT_PERSONA_LIMITS,
} from '@/constants/assistant-persona'
import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { AssistantPromptPersona } from '@/types/assistant-persona'

import { withSummarizedBackstory } from './character-backstory-summary.service'

const LONG = '她在雾港长大。'.repeat(400)
const hash = (text: string) => createHash('sha256').update(text).digest('hex')

function persona(backstory: string): AssistantPromptPersona {
  return {
    ...ASSISTANT_PERSONA_DEFAULTS,
    characterCardId: 'card-1',
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

describe('withSummarizedBackstory（长经历先总结）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveRoute.mockResolvedValue({
      route: {
        adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
        apiKey: 'k',
        providerConfig: {},
      },
      modelId: LLM_TEXT_MODEL_IDS.DEEPSEEK_V4_PRO,
    })
    mockUpdate.mockResolvedValue({})
  })

  it('没超上限：原文照用，不查库也不调模型', async () => {
    const input = persona('短经历')
    expect(await withSummarizedBackstory('u1', input)).toBe(input)
    expect(mockFindFirst).not.toHaveBeenCalled()
    expect(mockCompletion).not.toHaveBeenCalled()
  })

  it('存过且哈希对得上：直接用存的那份，不调模型', async () => {
    mockFindFirst.mockResolvedValue({
      extensions: {
        'pv.backstorySummary': { hash: hash(LONG), text: '存好的总结' },
      },
    })
    const out = await withSummarizedBackstory('u1', persona(LONG))
    expect(out.promptCharacter?.backstory).toBe('存好的总结')
    expect(mockCompletion).not.toHaveBeenCalled()
  })

  it('经历改了（哈希不符）：用助手那一家的便宜档重算并存回卡上', async () => {
    mockFindFirst.mockResolvedValue({
      extensions: {
        'pv.tags': { character: [] },
        'pv.backstorySummary': { hash: 'old', text: '旧总结' },
      },
    })
    mockCompletion.mockResolvedValue('新总结')
    const out = await withSummarizedBackstory('u1', persona(LONG))
    expect(out.promptCharacter?.backstory).toBe('新总结')
    expect(mockCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
        modelId: LLM_TEXT_MODEL_IDS.DEEPSEEK_FLASH,
      }),
    )
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'card-1' },
      data: {
        extensions: {
          'pv.tags': { character: [] },
          'pv.backstorySummary': { hash: hash(LONG), text: '新总结' },
        },
      },
    })
  })

  it('总结超长也只留上限以内', async () => {
    mockFindFirst.mockResolvedValue({ extensions: null })
    mockCompletion.mockResolvedValue('长'.repeat(5000))
    const out = await withSummarizedBackstory('u1', persona(LONG))
    expect(out.promptCharacter?.backstory.length).toBe(
      ASSISTANT_PERSONA_LIMITS.maxCharacterBackstoryChars,
    )
  })

  it('总结失败：这一轮照旧（后面截断），不报错', async () => {
    mockFindFirst.mockResolvedValue({ extensions: null })
    mockCompletion.mockRejectedValue(new Error('no key'))
    const input = persona(LONG)
    expect(await withSummarizedBackstory('u1', input)).toBe(input)
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
