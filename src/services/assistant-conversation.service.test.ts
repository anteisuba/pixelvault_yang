import { beforeEach, expect, it, vi } from 'vitest'
import {
  appendAssistantConversationRound,
  getAssistantConversation,
  listAssistantConversationRounds,
  listAssistantConversations,
  renameAssistantConversation,
  deleteAssistantConversation,
} from './assistant-conversation.service'

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  ensureUser: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  db: {
    $queryRaw: mocks.queryRaw,
    assistantConversation: {
      updateMany: mocks.updateMany,
      deleteMany: mocks.deleteMany,
      findFirst: mocks.findFirst,
      update: mocks.update,
    },
  },
}))
vi.mock('@/services/user.service', () => ({ ensureUser: mocks.ensureUser }))
beforeEach(() => {
  vi.clearAllMocks()
  mocks.ensureUser.mockResolvedValue({ id: 'owner-id' })
})
it('deletes only a conversation owned by the authenticated user', async () => {
  mocks.deleteMany.mockResolvedValue({ count: 1 })
  expect(
    await deleteAssistantConversation('clerk-owner', 'conversation-id'),
  ).toBe(true)
  expect(mocks.ensureUser).toHaveBeenCalledWith('clerk-owner')
  expect(mocks.deleteMany).toHaveBeenCalledWith({
    where: { id: 'conversation-id', userId: 'owner-id' },
  })
})
it('returns not found for an inaccessible or missing conversation', async () => {
  mocks.deleteMany.mockResolvedValue({ count: 0 })
  expect(
    await deleteAssistantConversation('clerk-owner', 'other-user-conversation'),
  ).toBe(false)
})

it('renames only the authenticated owner conversation', async () => {
  mocks.updateMany.mockResolvedValue({ count: 1 })
  expect(
    await renameAssistantConversation('clerk-owner', 'conversation-id', {
      title: 'My title',
    }),
  ).toEqual({ title: 'My title' })
  expect(mocks.updateMany).toHaveBeenCalledWith({
    where: { id: 'conversation-id', userId: 'owner-id' },
    data: { title: 'My title' },
  })
  mocks.updateMany.mockResolvedValue({ count: 0 })
  expect(
    await renameAssistantConversation('clerk-owner', 'missing', {
      title: 'My title',
    }),
  ).toBeNull()
})

it('lists all operator surfaces in one owner-scoped summary query', async () => {
  mocks.queryRaw.mockResolvedValue([
    {
      id: 'one',
      surface: 'IMAGE_STUDIO',
      projectId: null,
      title: 'Name',
      updatedAt: new Date('2026-09-09T00:00:00Z'),
      messageCount: 8,
      operatorThread: true,
    },
  ])
  const result = await listAssistantConversations('clerk-owner', {
    surface: 'IMAGE_STUDIO',
    operatorOnly: true,
    limit: 20,
  })
  expect(mocks.queryRaw).toHaveBeenCalledOnce()
  const query = mocks.queryRaw.mock.calls[0][0]
  expect(query.values).toEqual([
    'owner-id',
    'IMAGE_STUDIO',
    'VIDEO_STUDIO',
    'LORA',
    20,
  ])
  expect(query.sql).toContain('jsonb_array_length')
  expect(query.sql).toContain('AND COALESCE')
  expect(query.sql).not.toMatch(/SELECT[^]*,\s*"messages"\s*[,\n]/)
  expect(result[0]).toMatchObject({
    messageCount: 8,
    operatorThread: true,
    updatedAt: '2026-09-09T00:00:00.000Z',
  })
  expect(result[0]).not.toHaveProperty('messages')
})
it('keeps canvas lists scoped to their project', async () => {
  mocks.queryRaw.mockResolvedValue([])
  await listAssistantConversations('clerk-owner', {
    surface: 'NODE_CANVAS',
    projectId: 'project-one',
  })
  const query = mocks.queryRaw.mock.calls[0][0]
  expect(query.values).toEqual(['owner-id', 'NODE_CANVAS', 'project-one', 20])
  expect(query.sql).toContain('AND "projectId" =')
})

// ─── 每轮结账（assistant-shell-v2 §7.2 / §7.5）────────────────────

const ROUND = {
  createdAt: '2026-09-11T00:00:00.000Z',
  facts: ['夜景配色定为冷蓝'],
  decisions: ['用 16:9'],
  todos: [],
  evidenceRefs: ['#e1'],
}

it('结账记录追加进这段会话，轮次号由服务端按已有条数定', async () => {
  mocks.findFirst.mockResolvedValue({ id: 'conv-1', rounds: [] })
  mocks.update.mockResolvedValue({})

  const stored = await appendAssistantConversationRound(
    'clerk-owner',
    'conv-1',
    ROUND,
  )

  expect(stored).toEqual({ ...ROUND, roundIndex: 0 })
  expect(mocks.findFirst).toHaveBeenCalledWith({
    where: { id: 'conv-1', userId: 'owner-id' },
    select: { id: true, rounds: true },
  })
  expect(mocks.update.mock.calls[0]?.[0]).toEqual({
    where: { id: 'conv-1' },
    data: { rounds: [{ ...ROUND, roundIndex: 0 }] },
  })
})

it('轮次号接着已有的那几条数，⛔ 不从零开始', async () => {
  mocks.findFirst.mockResolvedValue({
    id: 'conv-1',
    rounds: [{ ...ROUND, roundIndex: 0 }],
  })
  mocks.update.mockResolvedValue({})

  const stored = await appendAssistantConversationRound(
    'clerk-owner',
    'conv-1',
    ROUND,
  )

  expect(stored?.roundIndex).toBe(1)
})

it('会话不归这个用户时不写，也不抛 —— 结账不许阻塞 done', async () => {
  mocks.findFirst.mockResolvedValue(null)

  expect(
    await appendAssistantConversationRound('clerk-owner', 'conv-other', ROUND),
  ).toBeNull()
  expect(mocks.update).not.toHaveBeenCalled()
})

it('读回来时坏掉的那一条丢掉，⛔ 不作废整段会话', async () => {
  mocks.findFirst.mockResolvedValue({
    id: 'conv-1',
    surface: 'IMAGE_STUDIO',
    projectId: null,
    title: null,
    messages: [{ role: 'user', content: '你好' }],
    rounds: [
      { ...ROUND, roundIndex: 0 },
      { roundIndex: 1, facts: 'not-an-array' },
    ],
    createdAt: new Date('2026-09-11T00:00:00Z'),
    updatedAt: new Date('2026-09-11T00:00:00Z'),
  })

  const record = await getAssistantConversation('clerk-owner', {
    id: 'conv-1',
  })

  expect(record?.rounds).toEqual([{ ...ROUND, roundIndex: 0 }])
  expect(record?.messages).toHaveLength(1)
})

/**
 * **下一轮注入要读的那几条**（§7.6，commit #12）。
 *
 * ⚠ 它收的是 DB `userId`（⛔ 不是 clerkId）—— 调用方手上已经有那一行，
 * 为签名整齐再 upsert 一次用户，是给每一轮多加一次写库。
 */
it('注入读：按 userId 核所有权，只回最近几条', async () => {
  mocks.findFirst.mockResolvedValue({
    rounds: [
      { ...ROUND, roundIndex: 0 },
      { ...ROUND, roundIndex: 1 },
      { ...ROUND, roundIndex: 2 },
    ],
  })

  const rounds = await listAssistantConversationRounds('owner-id', 'conv-1', {
    limit: 2,
  })

  expect(mocks.findFirst).toHaveBeenCalledWith({
    where: { id: 'conv-1', userId: 'owner-id' },
    select: { rounds: true },
  })
  expect(rounds.map((round) => round.roundIndex)).toEqual([1, 2])
  // ⛔ 没有额外一次 ensureUser：调用方已经有那一行了。
  expect(mocks.ensureUser).not.toHaveBeenCalled()
})

it('注入读：会话不归这个用户 → 空，⛔ 不抛（注入不到不是跑不了）', async () => {
  mocks.findFirst.mockResolvedValue(null)
  expect(
    await listAssistantConversationRounds('owner-id', 'conv-other', {
      limit: 8,
    }),
  ).toEqual([])
})
