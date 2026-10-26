import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  db: {
    characterCard: { findFirst: vi.fn(), update: vi.fn() },
    characterJournal: {
      create: vi.fn(),
      findMany: vi.fn(async () => []),
      deleteMany: vi.fn(),
    },
  },
  llmTextCompletion: vi.fn(),
  listMemories: vi.fn(async () => []),
  recordMemories: vi.fn(),
  recordRevision: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ db: mocks.db }))
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }))
vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: mocks.llmTextCompletion,
}))
vi.mock('@/services/assistant-memory.service', () => ({
  listAssistantMemoriesForReview: mocks.listMemories,
  recordAssistantMemories: mocks.recordMemories,
}))
vi.mock('@/services/kernel/assistant-operator.service', () => ({
  resolveMemoryChanges: (draft: {
    memories?: { kind: string; text: string }[]
  }) => ({
    candidates: (draft.memories ?? []).map(({ kind, text }) => ({
      kind,
      text,
    })),
    replacements: [],
    forget: [],
  }),
}))
vi.mock('./character-revision.service', () => ({
  recordCharacterRevision: mocks.recordRevision,
}))

import { CharacterPersonaSchema } from '@/types'

import {
  applyReflectionToPersona,
  parseReflectionDraft,
  reflectOnChat,
  shouldReflect,
} from './character-reflection.service'

const ASSISTANT = {
  route: { adapterType: 'deepseek', apiKey: 'k', providerConfig: {} },
  modelId: 'deepseek-chat',
} as unknown as Parameters<typeof reflectOnChat>[0]['assistant']

const UPDATED_AT = new Date('2026-10-20T00:00:00Z')
const persona = (patch: Record<string, unknown> = {}) =>
  CharacterPersonaSchema.parse({
    identity: '图书馆管理员',
    speech: '慢吞吞',
    ...patch,
  })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.db.characterCard.findFirst.mockResolvedValue({
    id: 'card-1',
    name: 'Denia',
    tags: ['oc'],
    persona: persona(),
    updatedAt: UPDATED_AT,
  })
})

describe('shouldReflect', () => {
  it('每 30 句一次', () => {
    expect(shouldReflect(0)).toBe(false)
    expect(shouldReflect(29)).toBe(false)
    expect(shouldReflect(30)).toBe(true)
    expect(shouldReflect(60)).toBe(true)
  })
})

describe('parseReflectionDraft', () => {
  it('认带围栏的 JSON，坏的回 null', () => {
    expect(
      parseReflectionDraft('```json\n{"journal":"今天他画崩了"}\n```'),
    ).toEqual({ journal: '今天他画崩了' })
    expect(parseReflectionDraft('不是 JSON')).toBeNull()
  })
})

describe('applyReflectionToPersona', () => {
  it('名字和身份改不了，最多改 3 格，关系单独写', () => {
    const result = applyReflectionToPersona(persona(), {
      relationship: '叫他「笨蛋画师」，熟得能互损',
      persona: [
        { field: 'identity', text: '女王', reason: 'x' },
        { field: 'name', text: 'Queen' },
        { field: 'speech', text: '慢吞吞，熟了会拖长音', reason: '跟他熟了' },
        { field: 'moods', text: '慵懒\n嘴硬\n\n' },
        { field: 'boundaries', text: '不在他面前哭' },
        { field: 'scenario', text: '第四格被丢掉' },
      ],
    })
    expect(result?.persona).toMatchObject({
      identity: '图书馆管理员',
      speech: '慢吞吞，熟了会拖长音',
      moods: ['慵懒', '嘴硬'],
      relationship: '叫他「笨蛋画师」，熟得能互损',
      scenario: '',
    })
    expect(result?.reasons).toEqual(['跟他熟了'])
  })

  it('什么都没变回 null', () => {
    expect(applyReflectionToPersona(persona(), { persona: [] })).toBeNull()
  })
})

describe('reflectOnChat', () => {
  const messages = [
    { role: 'user' as const, content: '今天画崩了' },
    { role: 'assistant' as const, content: '又熬夜了吧' },
  ]

  it('写日记、记记忆、改卡不碰 updatedAt、记进「她改了什么」', async () => {
    mocks.llmTextCompletion.mockResolvedValue(
      JSON.stringify({
        journal: '他今天又画崩了，我陪他吃了甜点。',
        relationship: '叫他「画师」，越来越熟',
        memories: [{ kind: 'fact', text: '他常熬夜画图' }],
        persona: [{ field: 'speech', text: '慢吞吞，偶尔拖长音' }],
      }),
    )
    await expect(
      reflectOnChat({
        userId: 'u',
        cardId: 'card-1',
        messages,
        assistant: ASSISTANT,
      }),
    ).resolves.toBe(true)
    expect(mocks.db.characterJournal.create).toHaveBeenCalledWith({
      data: {
        userId: 'u',
        characterCardId: 'card-1',
        text: '他今天又画崩了，我陪他吃了甜点。',
      },
    })
    expect(mocks.recordMemories).toHaveBeenCalledWith(
      expect.objectContaining({
        characterCardId: 'card-1',
        candidates: [{ kind: 'fact', text: '他常熬夜画图' }],
      }),
    )
    expect(mocks.db.characterCard.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          updatedAt: UPDATED_AT,
          persona: expect.objectContaining({
            speech: '慢吞吞，偶尔拖长音',
            relationship: '叫他「画师」，越来越熟',
          }),
        }),
      }),
    )
    expect(mocks.recordRevision).toHaveBeenCalledWith(
      expect.objectContaining({ cardId: 'card-1', source: 'REFLECTION' }),
    )
    const prompt = mocks.llmTextCompletion.mock.calls[0]![0] as {
      userPrompt: string
    }
    expect(prompt.userPrompt).toContain('Creator: 今天画崩了')
    expect(prompt.userPrompt).toContain('Denia: 又熬夜了吧')
  })

  it('模型回了坏东西：什么都不写', async () => {
    mocks.llmTextCompletion.mockResolvedValue('抱歉')
    await expect(
      reflectOnChat({
        userId: 'u',
        cardId: 'card-1',
        messages,
        assistant: ASSISTANT,
      }),
    ).resolves.toBe(false)
    expect(mocks.db.characterJournal.create).not.toHaveBeenCalled()
    expect(mocks.db.characterCard.update).not.toHaveBeenCalled()
  })

  it('出错不抛', async () => {
    mocks.llmTextCompletion.mockRejectedValue(new Error('down'))
    await expect(
      reflectOnChat({
        userId: 'u',
        cardId: 'card-1',
        messages,
        assistant: ASSISTANT,
      }),
    ).resolves.toBe(false)
  })
})
