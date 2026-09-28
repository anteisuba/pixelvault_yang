import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockEnsureUser = vi.fn()
vi.mock('@/services/user.service', () => ({
  ensureUser: (...args: unknown[]) => mockEnsureUser(...args),
}))

const mockCount = vi.fn()
const mockCreate = vi.fn()
const mockFindMany = vi.fn()
const mockFindUnique = vi.fn()
const mockUpdate = vi.fn()
const mockUpdateMany = vi.fn()
vi.mock('@/lib/db', () => ({
  db: {
    mcpToken: {
      count: (...args: unknown[]) => mockCount(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
  },
}))

import {
  MCP_MAX_ACTIVE_TOKENS,
  MCP_TOKEN_PREFIX,
  MCP_TOKEN_TOUCH_INTERVAL_MS,
} from '@/constants/mcp'
import {
  createMcpToken,
  hashMcpToken,
  McpTokenLimitError,
  revokeMcpToken,
  verifyMcpToken,
} from '@/services/mcp/mcp-token.service'

const USER = { id: 'db_user_1', clerkId: 'clerk_1' }
const NOW = new Date('2026-09-28T12:00:00.000Z')

beforeEach(() => {
  vi.clearAllMocks()
  mockEnsureUser.mockResolvedValue(USER)
  mockUpdate.mockResolvedValue({})
})

describe('createMcpToken', () => {
  it('returns the plaintext once and stores only its hash', async () => {
    mockCount.mockResolvedValue(0)
    mockCreate.mockImplementation(async ({ data }) => ({
      id: 'tok_1',
      name: data.name,
      last4: data.last4,
      createdAt: NOW,
      lastUsedAt: null,
    }))

    const created = await createMcpToken(USER.clerkId, 'Claude Code')

    expect(created.token.startsWith(MCP_TOKEN_PREFIX)).toBe(true)
    const stored = mockCreate.mock.calls[0]![0].data
    expect(stored.tokenHash).toBe(hashMcpToken(created.token))
    expect(JSON.stringify(stored)).not.toContain(created.token)
    expect(created.last4).toBe(created.token.slice(-4))
    expect(created).toMatchObject({ id: 'tok_1', lastUsedAt: null })
  })

  it('mints a different token every time', async () => {
    mockCount.mockResolvedValue(0)
    mockCreate.mockImplementation(async ({ data }) => ({
      id: 'tok',
      name: data.name,
      last4: data.last4,
      createdAt: NOW,
      lastUsedAt: null,
    }))

    const first = await createMcpToken(USER.clerkId, 'a')
    const second = await createMcpToken(USER.clerkId, 'b')

    expect(first.token).not.toBe(second.token)
  })

  it('refuses past the active-token cap with a 409', async () => {
    mockCount.mockResolvedValue(MCP_MAX_ACTIVE_TOKENS)

    const attempt = createMcpToken(USER.clerkId, 'one too many')

    await expect(attempt).rejects.toBeInstanceOf(McpTokenLimitError)
    await expect(attempt).rejects.toMatchObject({ httpStatus: 409 })
    expect(mockCreate).not.toHaveBeenCalled()
  })
})

describe('revokeMcpToken', () => {
  it('only revokes an active token that belongs to the caller', async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 })

    expect(await revokeMcpToken(USER.clerkId, 'someone_elses')).toBe(false)
    expect(mockUpdateMany.mock.calls[0]![0].where).toEqual({
      id: 'someone_elses',
      userId: USER.id,
      revokedAt: null,
    })
  })
})

describe('verifyMcpToken', () => {
  const TOKEN = `${MCP_TOKEN_PREFIX}abc`

  function row(patch: Record<string, unknown> = {}) {
    return {
      id: 'tok_1',
      revokedAt: null,
      lastUsedAt: new Date(NOW.getTime() - 1000),
      user: { id: USER.id, clerkId: USER.clerkId, isDeleted: false },
      ...patch,
    }
  }

  it('does not touch the database for a foreign-looking token', async () => {
    expect(await verifyMcpToken('sk-ant-xyz', NOW)).toBeNull()
    expect(mockFindUnique).not.toHaveBeenCalled()
  })

  it('looks the token up by its hash and returns its owner', async () => {
    mockFindUnique.mockResolvedValue(row())

    expect(await verifyMcpToken(TOKEN, NOW)).toEqual({
      tokenId: 'tok_1',
      userId: USER.id,
      clerkId: USER.clerkId,
    })
    expect(mockFindUnique.mock.calls[0]![0].where).toEqual({
      tokenHash: hashMcpToken(TOKEN),
    })
  })

  it.each([
    ['unknown', null],
    ['revoked', row({ revokedAt: NOW })],
    ['owned by a deleted account', row({ user: { ...USER, isDeleted: true } })],
  ])('rejects a token that is %s', async (_label, found) => {
    mockFindUnique.mockResolvedValue(found)

    expect(await verifyMcpToken(TOKEN, NOW)).toBeNull()
  })

  it('writes lastUsedAt only once the touch interval has passed', async () => {
    mockFindUnique.mockResolvedValue(row())
    await verifyMcpToken(TOKEN, NOW)
    expect(mockUpdate).not.toHaveBeenCalled()

    mockFindUnique.mockResolvedValue(
      row({
        lastUsedAt: new Date(NOW.getTime() - MCP_TOKEN_TOUCH_INTERVAL_MS),
      }),
    )
    await verifyMcpToken(TOKEN, NOW)
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'tok_1' },
      data: { lastUsedAt: NOW },
    })
  })

  it('still lets the call through when recording lastUsedAt fails', async () => {
    mockFindUnique.mockResolvedValue(row({ lastUsedAt: null }))
    mockUpdate.mockRejectedValue(new Error('db hiccup'))

    expect(await verifyMcpToken(TOKEN, NOW)).not.toBeNull()
  })
})
