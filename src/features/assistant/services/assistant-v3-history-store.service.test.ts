import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AssistantV3HistorySummary } from '@/types/assistant-v3'

import {
  assistantV3HistoryStore,
  readStoredAssistantV3HistorySummaries,
} from './assistant-v3-history-store.service'

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  transaction: vi.fn(),
  lockRow: vi.fn(),
  executeRaw: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  db: {
    $transaction: mocks.transaction,
    assistantConversation: { findFirst: mocks.findFirst },
  },
}))

const key = { userId: 'user-1', conversationId: 'conv-1' }

function summary(
  through: string,
  decisions: string[] = ['16:9 横版'],
): AssistantV3HistorySummary {
  return {
    through,
    turns: 8,
    decisions,
    preferences: [],
    openItems: [],
    names: [],
  }
}

/** `Prisma.sql` 的参数（按出现顺序）。 */
function sqlValues(call: unknown[]): unknown[] {
  return (call[0] as { values: unknown[] }).values
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.transaction.mockImplementation(
    (action: (tx: unknown) => Promise<unknown>) =>
      action({ $queryRaw: mocks.lockRow, $executeRaw: mocks.executeRaw }),
  )
})

describe('readStoredAssistantV3HistorySummaries', () => {
  it('不是数组当空；坏的那一份丢掉，其余照留；只留最近几份', () => {
    expect(readStoredAssistantV3HistorySummaries(null)).toEqual([])
    expect(readStoredAssistantV3HistorySummaries({ through: 'x' })).toEqual([])
    const good = summary('turn-a')
    expect(
      readStoredAssistantV3HistorySummaries([{ through: 1 }, good, 'junk']),
    ).toEqual([good])
    const many = ['a', 'b', 'c', 'd', 'e'].map((id) => summary(`turn-${id}`))
    const kept = readStoredAssistantV3HistorySummaries(many)
    expect(kept.at(-1)).toEqual(many.at(-1))
    expect(kept.length).toBeLessThan(many.length)
  })
})

describe('assistantV3HistoryStore', () => {
  it('存得下', () => {
    expect(assistantV3HistoryStore.persists).toBe(true)
  })

  it('load 按会话与用户认，只读这一格', async () => {
    const stored = [summary('turn-a')]
    mocks.findFirst.mockResolvedValue({ historySummary: stored })
    expect(await assistantV3HistoryStore.load(key)).toEqual(stored)
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { id: 'conv-1', userId: 'user-1' },
      select: { historySummary: true },
    })
  })

  it('load：会话不在 / 不归他 / 还没写过 = 空', async () => {
    mocks.findFirst.mockResolvedValue(null)
    expect(await assistantV3HistoryStore.load(key)).toEqual([])
    mocks.findFirst.mockResolvedValue({ historySummary: null })
    expect(await assistantV3HistoryStore.load(key)).toEqual([])
  })

  it('update 锁那一行读改写，写回的是 apply 的结果，按会话与用户认', async () => {
    const before = summary('turn-a')
    const added = summary('turn-b', ['用 Flux'])
    mocks.lockRow.mockResolvedValue([{ historySummary: [before] }])
    const apply = vi.fn((current: AssistantV3HistorySummary[]) => [
      ...current,
      added,
    ])
    await assistantV3HistoryStore.update(key, apply)

    expect(apply).toHaveBeenCalledWith([before])
    const lock = mocks.lockRow.mock.calls[0]
    expect((lock[0] as { sql: string }).sql).toMatch(/FOR UPDATE/)
    expect(sqlValues(lock)).toEqual(['conv-1', 'user-1'])

    const write = mocks.executeRaw.mock.calls[0]
    const writeSql = (write[0] as { sql: string }).sql
    expect(writeSql).toMatch(/SET "historySummary" = \?::jsonb/)
    expect(writeSql).not.toMatch(/updatedAt/)
    const [json, id, userId] = sqlValues(write)
    expect(JSON.parse(json as string)).toEqual([before, added])
    expect([id, userId]).toEqual(['conv-1', 'user-1'])
  })

  it('update：会话不在 / 不归他就什么都不做', async () => {
    mocks.lockRow.mockResolvedValue([])
    const apply = vi.fn(() => [summary('turn-a')])
    await assistantV3HistoryStore.update(key, apply)
    expect(apply).not.toHaveBeenCalled()
    expect(mocks.executeRaw).not.toHaveBeenCalled()
  })

  it('update：apply 给出超份数的结果 ⛔ 写进库', async () => {
    mocks.lockRow.mockResolvedValue([{ historySummary: null }])
    const tooMany = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) =>
      summary(`turn-${id}`),
    )
    await expect(
      assistantV3HistoryStore.update(key, () => tooMany),
    ).rejects.toThrow()
    expect(mocks.executeRaw).not.toHaveBeenCalled()
  })
})
