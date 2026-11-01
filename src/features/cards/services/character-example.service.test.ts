import { beforeEach, describe, expect, it, vi } from 'vitest'

const { findFirst, update } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  db: { characterCard: { findFirst, update } },
}))
vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(async () => ({ id: 'user_1' })),
}))

import { addCharacterExample } from './character-example.service'

beforeEach(() => {
  findFirst.mockReset()
  update.mockReset()
})

describe('改写她那句存成示例（⑪ B）', () => {
  it('放最后，只留最近 10 段', async () => {
    findFirst.mockResolvedValue({
      id: 'card_1',
      persona: {
        examples: Array.from({ length: 10 }, (_, index) => ({
          user: `u${index}`,
          reply: `r${index}`,
        })),
      },
    })
    await expect(
      addCharacterExample('clerk_1', 'card_1', {
        user: '在想我？',
        reply: '想你干嘛。',
      }),
    ).resolves.toEqual({ examples: 10 })
    const examples = update.mock.calls[0]![0].data.persona.examples
    expect(examples[0]).toEqual({ user: 'u1', reply: 'r1' })
    expect(examples.at(-1)).toEqual({ user: '在想我？', reply: '想你干嘛。' })
  })

  it('不是本人的卡 = null，不写', async () => {
    findFirst.mockResolvedValue(null)
    await expect(
      addCharacterExample('clerk_1', 'card_x', { user: '', reply: '嗯' }),
    ).resolves.toBeNull()
    expect(update).not.toHaveBeenCalled()
  })
})
