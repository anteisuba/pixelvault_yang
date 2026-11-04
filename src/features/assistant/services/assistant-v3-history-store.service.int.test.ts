import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { db } from '@/lib/db'
import { createTestUser, resetDatabase } from '@/test/int/db'
import type { AssistantV3HistorySummary } from '@/types/assistant-v3'

import {
  assistantV3HistoryStore,
  readStoredAssistantV3HistorySummaries,
} from './assistant-v3-history-store.service'

/** v3 历史摘要那一格（`AssistantConversation.historySummary`）——真库（L2a）。 */
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

async function setup(historySummary?: AssistantV3HistorySummary[]) {
  const user = await createTestUser()
  const conversation = await db.assistantConversation.create({
    data: {
      userId: user.id,
      surface: 'IMAGE_STUDIO',
      messages: [],
      ...(historySummary ? { historySummary } : {}),
    },
  })
  const key = { userId: user.id, conversationId: conversation.id }
  const row = () =>
    db.assistantConversation.findUniqueOrThrow({
      where: { id: conversation.id },
    })
  return { user, conversation, key, row }
}

beforeEach(resetDatabase)

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

describe('assistantV3HistoryStore（真库）', () => {
  it('存得下', () => {
    expect(assistantV3HistoryStore.persists).toBe(true)
  })

  it('load 读这段会话存的那一格', async () => {
    const stored = [summary('turn-a')]
    const { key } = await setup(stored)
    expect(await assistantV3HistoryStore.load(key)).toEqual(stored)
  })

  it('load：会话不在 / 不归他 / 还没写过 = 空', async () => {
    const { key } = await setup([summary('turn-a')])
    const stranger = await createTestUser()
    expect(
      await assistantV3HistoryStore.load({ ...key, userId: stranger.id }),
    ).toEqual([])
    expect(
      await assistantV3HistoryStore.load({ ...key, conversationId: 'nope' }),
    ).toEqual([])
    const fresh = await setup()
    expect(await assistantV3HistoryStore.load(fresh.key)).toEqual([])
  })

  it('update 读改写：写回的是 apply 的结果，⛔ 不碰 updatedAt（列表排序不跳）', async () => {
    const before = summary('turn-a')
    const added = summary('turn-b', ['用 Flux'])
    const { key, row } = await setup([before])
    const updatedAt = (await row()).updatedAt
    const apply = vi.fn((current: AssistantV3HistorySummary[]) => [
      ...current,
      added,
    ])

    await assistantV3HistoryStore.update(key, apply)

    expect(apply).toHaveBeenCalledWith([before])
    const after = await row()
    expect(after.historySummary).toEqual([before, added])
    expect(after.updatedAt).toEqual(updatedAt)
  })

  it('update 同时来两次：两次都落下，⛔ 后一次盖掉前一次', async () => {
    const { key, row } = await setup([])
    await Promise.all([
      assistantV3HistoryStore.update(key, (current) => [
        ...current,
        summary('turn-a'),
      ]),
      assistantV3HistoryStore.update(key, (current) => [
        ...current,
        summary('turn-b'),
      ]),
    ])
    const stored = (await row()).historySummary as AssistantV3HistorySummary[]
    expect(stored.map((item) => item.through).sort()).toEqual([
      'turn-a',
      'turn-b',
    ])
  })

  it('update：会话不归他就什么都不做', async () => {
    const { key, row } = await setup([summary('turn-a')])
    const stranger = await createTestUser()
    const apply = vi.fn(() => [summary('turn-x')])

    await assistantV3HistoryStore.update({ ...key, userId: stranger.id }, apply)

    expect(apply).not.toHaveBeenCalled()
    expect((await row()).historySummary).toEqual([summary('turn-a')])
  })

  it('update：apply 给出超份数的结果 ⛔ 写进库', async () => {
    const { key, row } = await setup()
    const tooMany = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) =>
      summary(`turn-${id}`),
    )
    await expect(
      assistantV3HistoryStore.update(key, () => tooMany),
    ).rejects.toThrow()
    expect((await row()).historySummary).toBeNull()
  })
})
