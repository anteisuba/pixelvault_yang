/**
 * L2a 真库：聊天里「改写」她那句，存成一段对话示例（⑪ B）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { db } from '@/lib/db'
import { createTestCard } from '@/test/int/cards'
import { createTestUser, resetDatabase } from '@/test/int/db'

import { addCharacterExample } from './character-example.service'

let me: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  me = await createTestUser()
})

async function examplesOf(cardId: string) {
  const row = await db.characterCard.findUniqueOrThrow({
    where: { id: cardId },
  })
  return (row.persona as { examples: unknown[] }).examples
}

describe('改写她那句存成示例（⑪ B）', () => {
  it('放最后，只留最近 10 段', async () => {
    const card = await createTestCard(me.id, {
      persona: {
        examples: Array.from({ length: 10 }, (_, index) => ({
          user: `u${index}`,
          reply: `r${index}`,
        })),
      },
    })

    await expect(
      addCharacterExample(me.clerkId, card.id, {
        user: '在想我？',
        reply: '想你干嘛。',
      }),
    ).resolves.toEqual({ examples: 10 })

    const examples = await examplesOf(card.id)
    expect(examples[0]).toEqual({ user: 'u1', reply: 'r1' })
    expect(examples.at(-1)).toEqual({ user: '在想我？', reply: '想你干嘛。' })
  })

  it('空白卡（没有 persona）也能存第一段', async () => {
    const card = await createTestCard(me.id)
    await expect(
      addCharacterExample(me.clerkId, card.id, { user: '早', reply: '嗯' }),
    ).resolves.toEqual({ examples: 1 })
    expect(await examplesOf(card.id)).toEqual([{ user: '早', reply: '嗯' }])
  })

  it('不是本人的卡 / 已删的卡 = null，不写', async () => {
    const other = await createTestUser()
    const theirs = await createTestCard(other.id)
    const deleted = await createTestCard(me.id, { isDeleted: true })

    await expect(
      addCharacterExample(me.clerkId, theirs.id, { user: '', reply: '嗯' }),
    ).resolves.toBeNull()
    await expect(
      addCharacterExample(me.clerkId, deleted.id, { user: '', reply: '嗯' }),
    ).resolves.toBeNull()
    const rows = await db.characterCard.findMany()
    expect(rows.every((row) => row.persona === null)).toBe(true)
  })
})
