import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const db = vi.hoisted(() => ({ findUnique: vi.fn(), upsert: vi.fn() }))
vi.mock('@/lib/db', () => ({
  db: { promptTagStack: { findUnique: db.findUnique, upsert: db.upsert } },
}))
vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(async () => ({ id: 'u1' })),
}))

import {
  getPromptTagStack,
  savePromptTagStack,
} from '@/services/prompts/prompt-tag-stack.service'

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

beforeEach(() => vi.clearAllMocks())

describe('prompt tag stack service', () => {
  it('null when the account never saved one', async () => {
    db.findUnique.mockResolvedValue(null)
    expect(await getPromptTagStack('clerk_1')).toBeNull()
  })

  it('drops broken entries instead of failing the read', async () => {
    db.findUnique.mockResolvedValue({
      positive: [selection, { id: 'bad' }],
      negative: 'not-an-array',
    })
    expect(await getPromptTagStack('clerk_1')).toEqual({
      positive: [selection],
      negative: [],
    })
  })

  it('upserts the whole stack on the user row', async () => {
    const stack = { positive: [selection], negative: [] }
    await savePromptTagStack('clerk_1', stack)
    expect(db.upsert).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      create: { userId: 'u1', ...stack },
      update: stack,
    })
  })
})
