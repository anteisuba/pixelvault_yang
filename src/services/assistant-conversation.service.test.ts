import { beforeEach, expect, it, vi } from 'vitest'
import {
  listAssistantConversations,
  renameAssistantConversation,
  deleteAssistantConversation,
} from './assistant-conversation.service'

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
  ensureUser: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  db: {
    $queryRaw: mocks.queryRaw,
    assistantConversation: {
      updateMany: mocks.updateMany,
      deleteMany: mocks.deleteMany,
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
