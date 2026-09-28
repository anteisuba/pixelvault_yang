import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockEnsureUser = vi.fn()
vi.mock('@/services/user.service', () => ({
  ensureUser: (...args: unknown[]) => mockEnsureUser(...args),
}))

const mockFindFirst = vi.fn()
const mockCount = vi.fn()
vi.mock('@/lib/db', () => ({
  db: {
    nodeWorkflowProject: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
    mcpToken: { count: (...args: unknown[]) => mockCount(...args) },
  },
}))

import { MCP_ACTIVE_WINDOW_MS } from '@/constants/mcp'
import { getProjectFollowStatus } from '@/services/mcp/mcp-follow.service'

const NOW = new Date('2026-09-28T12:00:00.000Z')
const VERSION = new Date('2026-09-28T11:59:00.000Z')

beforeEach(() => {
  vi.clearAllMocks()
  mockEnsureUser.mockResolvedValue({ id: 'db_user_1' })
  mockFindFirst.mockResolvedValue({ updatedAt: VERSION })
  mockCount.mockResolvedValue(0)
})

describe('getProjectFollowStatus', () => {
  it('returns only the version and whether Claude is active', async () => {
    mockCount.mockResolvedValue(1)

    expect(await getProjectFollowStatus('clerk_1', 'p1', NOW)).toEqual({
      updatedAt: VERSION.toISOString(),
      mcpActive: true,
    })
    expect(mockFindFirst.mock.calls[0]![0]).toEqual({
      where: { id: 'p1', userId: 'db_user_1', isDeleted: false },
      select: { updatedAt: true },
    })
    expect(mockCount.mock.calls[0]![0].where.lastUsedAt).toEqual({
      gte: new Date(NOW.getTime() - MCP_ACTIVE_WINDOW_MS),
    })
  })

  it('is null for a project that is not the caller’s', async () => {
    mockFindFirst.mockResolvedValue(null)

    expect(await getProjectFollowStatus('clerk_1', 'p1', NOW)).toBeNull()
  })

  it('still gives the version when token activity cannot be read', async () => {
    mockCount.mockRejectedValue(new Error('relation "McpToken" does not exist'))

    expect(await getProjectFollowStatus('clerk_1', 'p1', NOW)).toEqual({
      updatedAt: VERSION.toISOString(),
      mcpActive: false,
    })
  })
})
