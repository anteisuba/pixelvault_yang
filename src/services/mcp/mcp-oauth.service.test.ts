import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  mcpToken: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
}))
vi.mock('@/lib/db', () => ({ db }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn() } }))

const mockVerify = vi.fn()
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: async () => ({
    idPOAuthAccessToken: {
      verify: (...args: unknown[]) => mockVerify(...args),
    },
  }),
}))

import {
  mcpOAuthIssuer,
  verifyMcpOAuthToken,
} from '@/services/mcp/mcp-oauth.service'

const NOW = new Date('2026-10-30T10:00:00.000Z')
const USER = { id: 'db_user_1', clerkId: 'user_clerk_1', isDeleted: false }

function accessToken(patch: Record<string, unknown> = {}) {
  return {
    clientId: 'client_abcd1234',
    subject: USER.clerkId,
    revoked: false,
    expired: false,
    createdAt: NOW.getTime() - 60_000,
    ...patch,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  db.user.findUnique.mockResolvedValue(USER)
  db.mcpToken.update.mockResolvedValue({})
})

describe('mcpOAuthIssuer', () => {
  it('reads the Clerk frontend host out of the publishable key', () => {
    expect(mcpOAuthIssuer('pk_live_Y2xlcmsuYW50ZWlzdWJhLmNvbSQ')).toBe(
      'https://clerk.anteisuba.com',
    )
    expect(mcpOAuthIssuer('')).toBeNull()
  })
})

describe('verifyMcpOAuthToken', () => {
  it('rejects anything Clerk does not vouch for', async () => {
    mockVerify.mockRejectedValue(new Error('invalid'))
    expect(await verifyMcpOAuthToken('oat_x', NOW)).toBeNull()

    mockVerify.mockResolvedValue(accessToken({ revoked: true }))
    expect(await verifyMcpOAuthToken('oat_x', NOW)).toBeNull()
  })

  it('files a first-time connection as its own view-only row', async () => {
    mockVerify.mockResolvedValue(accessToken())
    db.mcpToken.findUnique.mockResolvedValue(null)
    db.mcpToken.upsert.mockResolvedValue({ id: 'row_1', access: 'read' })

    const owner = await verifyMcpOAuthToken('oat_x', NOW)

    expect(owner).toEqual({
      tokenId: 'row_1',
      userId: 'db_user_1',
      clerkId: 'user_clerk_1',
      access: 'read',
    })
    expect(db.mcpToken.upsert.mock.calls[0]![0].create).toMatchObject({
      oauthClientId: 'client_abcd1234',
      access: 'read',
    })
  })

  it('keeps the access she chose for a known connection', async () => {
    mockVerify.mockResolvedValue(accessToken())
    db.mcpToken.findUnique.mockResolvedValue({
      id: 'row_1',
      access: 'generate',
      revokedAt: null,
      lastUsedAt: NOW,
    })

    expect((await verifyMcpOAuthToken('oat_x', NOW))?.access).toBe('generate')
    expect(db.mcpToken.upsert).not.toHaveBeenCalled()
  })

  it('stays cut off after she revokes it, until she connects again', async () => {
    db.mcpToken.findUnique.mockResolvedValue({
      id: 'row_1',
      access: 'edit',
      revokedAt: new Date(NOW.getTime() - 30_000),
      lastUsedAt: null,
    })

    // 吊销之前签的令牌：拒。
    mockVerify.mockResolvedValue(accessToken())
    expect(await verifyMcpOAuthToken('oat_old', NOW)).toBeNull()

    // 吊销之后重新同意签的：重新连上，回到只看。
    mockVerify.mockResolvedValue(
      accessToken({ createdAt: NOW.getTime() - 1_000 }),
    )
    db.mcpToken.upsert.mockResolvedValue({ id: 'row_1', access: 'read' })
    expect((await verifyMcpOAuthToken('oat_new', NOW))?.access).toBe('read')
    expect(db.mcpToken.upsert.mock.calls[0]![0].update).toMatchObject({
      revokedAt: null,
      access: 'read',
    })
  })
})
