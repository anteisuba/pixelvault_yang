/**
 * L2a 真库：聊满一段之后她回想一下（写日记、记记忆、改卡、记进「她改了什么」）。
 * 记忆服务、改动记录、库全真；只假文字模型。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const llmTextCompletion = vi.hoisted(() => vi.fn())
vi.mock('@/services/llm-text.service', () => ({ llmTextCompletion }))

import { db } from '@/lib/db'
import { createTestCard } from '@/test/int/cards'
import { createTestUser, resetDatabase } from '@/test/int/db'
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
        { field: 'catchphrases', text: '懒得动\n随便\n\n' },
        { field: 'boundaries', text: '不在他面前哭' },
        { field: 'scenario', text: '第四格被丢掉' },
      ],
    })
    expect(result?.persona).toMatchObject({
      identity: '图书馆管理员',
      speech: '慢吞吞，熟了会拖长音',
      catchphrases: ['懒得动', '随便'],
      relationship: '叫他「笨蛋画师」，熟得能互损',
      scenario: '',
    })
    expect(result?.reasons).toEqual(['跟他熟了'])
  })

  it('钉住的格她不改；钉住「和你的关系」就不更新它（第 ② 步）', () => {
    const result = applyReflectionToPersona(
      persona(),
      {
        relationship: '熟了',
        persona: [
          { field: 'speech', text: '变了' },
          { field: 'catchphrases', text: '懒得动' },
        ],
      },
      ['speech', 'relationship'],
    )
    expect(result?.persona).toMatchObject({
      speech: '慢吞吞',
      catchphrases: ['懒得动'],
      relationship: '',
    })
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

  let me: Awaited<ReturnType<typeof createTestUser>>
  let cardId: string

  beforeEach(async () => {
    llmTextCompletion.mockReset()
    await resetDatabase()
    me = await createTestUser()
    cardId = (
      await createTestCard(me.id, {
        name: 'Denia',
        tags: ['oc'],
        persona: persona(),
      })
    ).id
    await db.$executeRaw`UPDATE "CharacterCard" SET "updatedAt" = ${UPDATED_AT} WHERE "id" = ${cardId}`
  })

  const reflect = () =>
    reflectOnChat({ userId: me.id, cardId, messages, assistant: ASSISTANT })

  it('写日记、记记忆、改卡不碰 updatedAt、记进「她改了什么」', async () => {
    llmTextCompletion.mockResolvedValue(
      JSON.stringify({
        journal: '他今天又画崩了，我陪他吃了甜点。',
        relationship: '叫他「画师」，越来越熟',
        memories: [{ kind: 'fact', text: '他常熬夜画图' }],
        persona: [{ field: 'speech', text: '慢吞吞，偶尔拖长音' }],
      }),
    )

    await expect(reflect()).resolves.toBe(true)

    const journals = await db.characterJournal.findMany()
    expect(journals).toEqual([
      expect.objectContaining({
        userId: me.id,
        characterCardId: cardId,
        text: '他今天又画崩了，我陪他吃了甜点。',
      }),
    ])
    const memories = await db.assistantMemory.findMany({
      where: { userId: me.id },
    })
    expect(memories).toEqual([
      expect.objectContaining({
        characterCardId: cardId,
        text: '他常熬夜画图',
      }),
    ])
    const card = await db.characterCard.findUniqueOrThrow({
      where: { id: cardId },
    })
    expect(card.updatedAt).toEqual(UPDATED_AT)
    expect(card.version).toBe(2)
    expect(card.persona).toMatchObject({
      speech: '慢吞吞，偶尔拖长音',
      relationship: '叫他「画师」，越来越熟',
    })
    const revisions = await db.characterCardRevision.findMany()
    expect(revisions).toEqual([
      expect.objectContaining({
        characterCardId: cardId,
        source: 'REFLECTION',
        fields: expect.arrayContaining(['speech', 'relationship']),
      }),
    ])
    const prompt = llmTextCompletion.mock.calls[0]![0] as {
      userPrompt: string
    }
    expect(prompt.userPrompt).toContain('Creator: 今天画崩了')
    expect(prompt.userPrompt).toContain('Denia: 又熬夜了吧')
  })

  it('模型回了坏东西：什么都不写', async () => {
    llmTextCompletion.mockResolvedValue('抱歉')
    await expect(reflect()).resolves.toBe(false)
    expect(await db.characterJournal.count()).toBe(0)
    expect(await db.characterCardRevision.count()).toBe(0)
    const card = await db.characterCard.findUniqueOrThrow({
      where: { id: cardId },
    })
    expect(card.version).toBe(1)
  })

  it('出错不抛', async () => {
    llmTextCompletion.mockRejectedValue(new Error('down'))
    await expect(reflect()).resolves.toBe(false)
  })

  it('不是本人的卡：不问模型、不写', async () => {
    const other = await createTestUser()
    await expect(
      reflectOnChat({
        userId: other.id,
        cardId,
        messages,
        assistant: ASSISTANT,
      }),
    ).resolves.toBe(false)
    expect(llmTextCompletion).not.toHaveBeenCalled()
  })
})
