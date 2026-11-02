import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  db: {
    characterCard: { findFirst: vi.fn(), update: vi.fn() },
  },
  llmTextCompletion: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ db: mocks.db }))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }))
vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: mocks.llmTextCompletion,
}))

import {
  learnCreatorPhrases,
  mergeLearnedPhrases,
  shouldLearnPhrases,
} from './character-learned-phrases.service'

const ASSISTANT = {
  route: { adapterType: 'deepseek', apiKey: 'k', providerConfig: {} },
  modelId: 'deepseek-chat',
} as unknown as Parameters<typeof learnCreatorPhrases>[0]['assistant']

const UPDATED_AT = new Date('2026-10-20T00:00:00Z')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.db.characterCard.findFirst.mockResolvedValue({
    id: 'card-1',
    persona: { identity: '图书馆管理员', learnedPhrases: ['绝了'] },
    updatedAt: UPDATED_AT,
  })
})

describe('mergeLearnedPhrases', () => {
  it('keeps only what you actually said, skips her own catchphrases, newest last', () => {
    expect(
      mergeLearnedPhrases(
        ['绝了', '离谱'],
        ['摸鱼', '离谱', '编出来的', '嗯……'],
        '今天又摸鱼了，离谱。嗯……',
        ['嗯……'],
      ),
    ).toEqual(['绝了', '摸鱼', '离谱'])
  })

  it('pushes the oldest out when full', () => {
    const kept = Array.from({ length: 12 }, (_, index) => `词${index}`)
    const merged = mergeLearnedPhrases(kept, ['新词'], '新词')
    expect(merged).toHaveLength(12)
    expect(merged[0]).toBe('词1')
    expect(merged.at(-1)).toBe('新词')
  })
})

describe('shouldLearnPhrases', () => {
  it('learns on every eighth line of yours', () => {
    expect(shouldLearnPhrases(0)).toBe(false)
    expect(shouldLearnPhrases(7)).toBe(false)
    expect(shouldLearnPhrases(8)).toBe(true)
    expect(shouldLearnPhrases(16)).toBe(true)
  })
})

describe('learnCreatorPhrases', () => {
  it('reads what you said oldest first and saves new phrases without bumping the card', async () => {
    mocks.llmTextCompletion.mockResolvedValue('{"phrases": ["摸鱼", "光影"]}')
    const merged = await learnCreatorPhrases({
      userId: 'user-1',
      cardId: 'card-1',
      said: ['这张光影绝了', '今天又摸鱼了'],
      assistant: ASSISTANT,
    })

    expect(mocks.llmTextCompletion.mock.calls[0][0].userPrompt).toBe(
      '这张光影绝了\n今天又摸鱼了',
    )
    expect(merged).toEqual(['绝了', '摸鱼', '光影'])
    expect(mocks.db.characterCard.update).toHaveBeenCalledWith({
      where: { id: 'card-1' },
      data: {
        persona: expect.objectContaining({
          identity: '图书馆管理员',
          learnedPhrases: ['绝了', '摸鱼', '光影'],
        }),
        updatedAt: UPDATED_AT,
      },
    })
  })

  it('writes nothing when nothing new was found, and never throws', async () => {
    mocks.llmTextCompletion.mockResolvedValue('{"phrases": []}')
    await learnCreatorPhrases({
      userId: 'user-1',
      cardId: 'card-1',
      said: ['这张光影绝了'],
      assistant: ASSISTANT,
    })
    expect(mocks.db.characterCard.update).not.toHaveBeenCalled()

    mocks.llmTextCompletion.mockRejectedValue(new Error('no key'))
    await expect(
      learnCreatorPhrases({
        userId: 'user-1',
        cardId: 'card-1',
        said: ['这张光影绝了'],
        assistant: ASSISTANT,
      }),
    ).resolves.toBeNull()
  })
})
