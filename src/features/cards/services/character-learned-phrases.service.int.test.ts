/**
 * L2a 真库：从你说过的话里学口头禅（合并规则 + 真读写卡上的 persona）。只假文字模型。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const llmTextCompletion = vi.hoisted(() => vi.fn())
vi.mock('@/services/llm-text.service', () => ({ llmTextCompletion }))

import { CARD_EXTENSIONS } from '@/constants/cards/character-card'
import { db } from '@/lib/db'
import { createTestCard } from '@/test/int/cards'
import { createTestUser, resetDatabase } from '@/test/int/db'

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

let me: Awaited<ReturnType<typeof createTestUser>>
let cardId: string

beforeEach(async () => {
  llmTextCompletion.mockReset()
  await resetDatabase()
  me = await createTestUser()
  cardId = (
    await createTestCard(me.id, {
      persona: { identity: '图书馆管理员', learnedPhrases: ['绝了'] },
    })
  ).id
  // 学到的词不算「改了这张卡」：updatedAt 保持原样。
  await db.$executeRaw`UPDATE "CharacterCard" SET "updatedAt" = ${UPDATED_AT} WHERE "id" = ${cardId}`
})

const learn = (said: string[], userId = me.id) =>
  learnCreatorPhrases({ userId, cardId, said, assistant: ASSISTANT })

async function cardRow() {
  return db.characterCard.findUniqueOrThrow({ where: { id: cardId } })
}

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
  it('按先后读你说的话，存下新学到的词，卡的 updatedAt 不动', async () => {
    llmTextCompletion.mockResolvedValue('{"phrases": ["摸鱼", "光影"]}')

    const merged = await learn(['这张光影绝了', '今天又摸鱼了'])

    expect(llmTextCompletion.mock.calls[0]![0].userPrompt).toBe(
      '这张光影绝了\n今天又摸鱼了',
    )
    expect(merged).toEqual(['绝了', '摸鱼', '光影'])
    const row = await cardRow()
    expect(row.persona).toMatchObject({
      identity: '图书馆管理员',
      learnedPhrases: ['绝了', '摸鱼', '光影'],
    })
    expect(row.updatedAt).toEqual(UPDATED_AT)
  })

  it('没学到新的不写；模型出错不抛、回 null', async () => {
    llmTextCompletion.mockResolvedValue('{"phrases": []}')
    await learn(['这张光影绝了'])
    expect((await cardRow()).persona).toMatchObject({
      learnedPhrases: ['绝了'],
    })

    llmTextCompletion.mockRejectedValue(new Error('no key'))
    await expect(learn(['这张光影绝了'])).resolves.toBeNull()
  })

  it('钉住了「学到的词」就不问模型，照旧回卡上那几条', async () => {
    await db.characterCard.update({
      where: { id: cardId },
      data: {
        extensions: { [CARD_EXTENSIONS.KEYS.pinnedFields]: ['learnedPhrases'] },
      },
    })
    await expect(learn(['摸鱼'])).resolves.toEqual(['绝了'])
    expect(llmTextCompletion).not.toHaveBeenCalled()
  })

  it('不是本人的卡 = null，不问模型', async () => {
    const other = await createTestUser()
    await expect(learn(['摸鱼'], other.id)).resolves.toBeNull()
    expect(llmTextCompletion).not.toHaveBeenCalled()
  })
})
