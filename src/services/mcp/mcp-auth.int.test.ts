/**
 * L2a 真库：外部 AI 连进来的那几道门——自己生成的令牌、OAuth 连接、开着的画布跟随。
 * 只假边界：Clerk 验 OAuth 令牌那一跳。核的是令牌表里的行。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const clerk = vi.hoisted(() => ({ verify: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: async () => ({
    idPOAuthAccessToken: { verify: clerk.verify },
  }),
}))

import {
  MCP_ACTIVE_WINDOW_MS,
  MCP_MAX_ACTIVE_TOKENS,
  MCP_TOKEN_PREFIX,
  MCP_TOKEN_TOUCH_INTERVAL_MS,
} from '@/constants/mcp'
import { db } from '@/lib/db'
import { getProjectFollowStatus } from '@/services/mcp/mcp-follow.service'
import {
  mcpOAuthIssuer,
  verifyMcpOAuthToken,
} from '@/services/mcp/mcp-oauth.service'
import {
  createMcpToken,
  hashMcpToken,
  McpTokenLimitError,
  revokeMcpToken,
  verifyMcpToken,
} from '@/services/mcp/mcp-token.service'
import { createTestUser, resetDatabase } from '@/test/int/db'

const NOW = new Date('2026-10-30T10:00:00.000Z')

beforeEach(async () => {
  await resetDatabase()
  clerk.verify.mockReset()
})

describe('自己生成的令牌', () => {
  it('明文只回一次，库里只存它的哈希；每次生成都不一样', async () => {
    const user = await createTestUser()

    const first = await createMcpToken(user.clerkId, 'Claude Code')
    const second = await createMcpToken(user.clerkId, 'Cursor')

    expect(first.token.startsWith(MCP_TOKEN_PREFIX)).toBe(true)
    expect(first.token).not.toBe(second.token)
    expect(first.last4).toBe(first.token.slice(-4))
    const rows = await db.mcpToken.findMany({ where: { userId: user.id } })
    expect(rows).toHaveLength(2)
    const stored = rows.find((row) => row.id === first.id)!
    expect(stored.tokenHash).toBe(hashMcpToken(first.token))
    expect(JSON.stringify(rows)).not.toContain(first.token)
    expect(stored).toMatchObject({ name: 'Claude Code', lastUsedAt: null })
  })

  it('有效令牌到上限再要一把：409，库里不多一行', async () => {
    const user = await createTestUser()
    for (let i = 0; i < MCP_MAX_ACTIVE_TOKENS; i++) {
      await createMcpToken(user.clerkId, `t${i}`)
    }

    const attempt = createMcpToken(user.clerkId, 'one too many')

    await expect(attempt).rejects.toBeInstanceOf(McpTokenLimitError)
    await expect(attempt).rejects.toMatchObject({ httpStatus: 409 })
    expect(await db.mcpToken.count({ where: { userId: user.id } })).toBe(
      MCP_MAX_ACTIVE_TOKENS,
    )
  })

  it('只能吊销自己的令牌；吊销后验不过', async () => {
    const owner = await createTestUser()
    const stranger = await createTestUser()
    const created = await createMcpToken(owner.clerkId, 'mine')

    expect(await revokeMcpToken(stranger.clerkId, created.id)).toBe(false)
    expect(await verifyMcpToken(created.token, NOW)).not.toBeNull()

    expect(await revokeMcpToken(owner.clerkId, created.id)).toBe(true)
    expect(
      (await db.mcpToken.findUnique({ where: { id: created.id } }))?.revokedAt,
    ).not.toBeNull()
    expect(await verifyMcpToken(created.token, NOW)).toBeNull()
  })

  it('验令牌回它的主人；不认识的权限当只看；别家的令牌、已删账号一律拒', async () => {
    const user = await createTestUser()
    const created = await createMcpToken(user.clerkId, 'mine')

    expect(await verifyMcpToken(created.token, NOW)).toEqual({
      tokenId: created.id,
      userId: user.id,
      clerkId: user.clerkId,
      access: 'read',
    })

    await db.mcpToken.update({
      where: { id: created.id },
      data: { access: 'generate' },
    })
    expect((await verifyMcpToken(created.token, NOW))?.access).toBe('generate')
    await db.mcpToken.update({
      where: { id: created.id },
      data: { access: 'admin' },
    })
    expect((await verifyMcpToken(created.token, NOW))?.access).toBe('read')

    expect(await verifyMcpToken('sk-ant-xyz', NOW)).toBeNull()
    expect(await verifyMcpToken(`${MCP_TOKEN_PREFIX}unknown`, NOW)).toBeNull()

    await db.user.update({ where: { id: user.id }, data: { isDeleted: true } })
    expect(await verifyMcpToken(created.token, NOW)).toBeNull()
  })

  it('lastUsedAt 过了节流间隔才写', async () => {
    const user = await createTestUser()
    const created = await createMcpToken(user.clerkId, 'mine')
    const recent = new Date(NOW.getTime() - 1000)
    await db.mcpToken.update({
      where: { id: created.id },
      data: { lastUsedAt: recent },
    })

    await verifyMcpToken(created.token, NOW)
    expect(
      (await db.mcpToken.findUnique({ where: { id: created.id } }))?.lastUsedAt,
    ).toEqual(recent)

    await db.mcpToken.update({
      where: { id: created.id },
      data: {
        lastUsedAt: new Date(NOW.getTime() - MCP_TOKEN_TOUCH_INTERVAL_MS),
      },
    })
    await verifyMcpToken(created.token, NOW)
    expect(
      (await db.mcpToken.findUnique({ where: { id: created.id } }))?.lastUsedAt,
    ).toEqual(NOW)
  })

  it('记 lastUsedAt 失败也照样放行', async () => {
    const user = await createTestUser()
    const created = await createMcpToken(user.clerkId, 'mine')
    // 只在这一跳注入一次故障，库本身是真的。
    const update = vi
      .spyOn(db.mcpToken, 'update')
      .mockRejectedValueOnce(new Error('db hiccup'))

    expect(await verifyMcpToken(created.token, NOW)).not.toBeNull()
    update.mockRestore()
  })
})

describe('OAuth 连接', () => {
  function accessToken(subject: string, patch: Record<string, unknown> = {}) {
    return {
      clientId: 'client_abcd1234',
      subject,
      revoked: false,
      expired: false,
      createdAt: NOW.getTime() - 60_000,
      ...patch,
    }
  }

  it('从 publishable key 里读出 Clerk 前台域名', () => {
    expect(mcpOAuthIssuer('pk_live_Y2xlcmsuYW50ZWlzdWJhLmNvbSQ')).toBe(
      'https://clerk.anteisuba.com',
    )
    expect(mcpOAuthIssuer('')).toBeNull()
  })

  it('Clerk 不认的、已吊销的令牌一律拒，库里不落行', async () => {
    const user = await createTestUser()
    clerk.verify.mockRejectedValueOnce(new Error('invalid'))
    expect(await verifyMcpOAuthToken('oat_x', NOW)).toBeNull()

    clerk.verify.mockResolvedValueOnce(
      accessToken(user.clerkId, { revoked: true }),
    )
    expect(await verifyMcpOAuthToken('oat_x', NOW)).toBeNull()
    expect(await db.mcpToken.count()).toBe(0)
  })

  it('第一次连上落一行只看；已知连接保留她选的权限、不再多落', async () => {
    const user = await createTestUser()
    clerk.verify.mockResolvedValue(accessToken(user.clerkId))

    const owner = await verifyMcpOAuthToken('oat_x', NOW)

    const rows = await db.mcpToken.findMany({ where: { userId: user.id } })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      oauthClientId: 'client_abcd1234',
      access: 'read',
    })
    expect(owner).toEqual({
      tokenId: rows[0]!.id,
      userId: user.id,
      clerkId: user.clerkId,
      access: 'read',
    })

    await db.mcpToken.update({
      where: { id: rows[0]!.id },
      data: { access: 'generate' },
    })
    expect((await verifyMcpOAuthToken('oat_x', NOW))?.access).toBe('generate')
    expect(await db.mcpToken.count()).toBe(1)
  })

  it('吊销后旧令牌拒；重新同意签的新令牌重新连上、回到只看', async () => {
    const user = await createTestUser()
    clerk.verify.mockResolvedValue(accessToken(user.clerkId))
    const first = await verifyMcpOAuthToken('oat_x', NOW)
    await db.mcpToken.update({
      where: { id: first!.tokenId },
      data: { access: 'edit', revokedAt: new Date(NOW.getTime() - 30_000) },
    })

    expect(await verifyMcpOAuthToken('oat_old', NOW)).toBeNull()

    clerk.verify.mockResolvedValue(
      accessToken(user.clerkId, { createdAt: NOW.getTime() - 1_000 }),
    )
    expect((await verifyMcpOAuthToken('oat_new', NOW))?.access).toBe('read')
    const row = await db.mcpToken.findUnique({ where: { id: first!.tokenId } })
    expect(row).toMatchObject({ revokedAt: null, access: 'read' })
  })
})

describe('开着的画布跟随', () => {
  it('只回版本号和 Claude 是否在线；别人的项目回 null', async () => {
    const user = await createTestUser()
    const stranger = await createTestUser()
    const project = await db.nodeWorkflowProject.create({
      data: { userId: user.id, name: 'p', state: { nodes: [], edges: [] } },
    })
    const now = new Date(project.updatedAt.getTime() + 60_000)

    expect(await getProjectFollowStatus(user.clerkId, project.id, now)).toEqual(
      { updatedAt: project.updatedAt.toISOString(), mcpActive: false },
    )

    const token = await createMcpToken(user.clerkId, 'mine')
    await db.mcpToken.update({
      where: { id: token.id },
      data: { lastUsedAt: new Date(now.getTime() - MCP_ACTIVE_WINDOW_MS / 2) },
    })
    expect(
      (await getProjectFollowStatus(user.clerkId, project.id, now))?.mcpActive,
    ).toBe(true)

    // 过了在线窗口就不算在线。
    expect(
      (
        await getProjectFollowStatus(
          user.clerkId,
          project.id,
          new Date(now.getTime() + MCP_ACTIVE_WINDOW_MS),
        )
      )?.mcpActive,
    ).toBe(false)

    expect(
      await getProjectFollowStatus(stranger.clerkId, project.id, now),
    ).toBeNull()
  })

  it('读不到令牌活动也照样给版本号', async () => {
    const user = await createTestUser()
    const project = await db.nodeWorkflowProject.create({
      data: { userId: user.id, name: 'p', state: { nodes: [], edges: [] } },
    })
    const count = vi
      .spyOn(db.mcpToken, 'count')
      .mockRejectedValueOnce(new Error('relation "McpToken" does not exist'))

    expect(await getProjectFollowStatus(user.clerkId, project.id)).toEqual({
      updatedAt: project.updatedAt.toISOString(),
      mcpActive: false,
    })
    count.mockRestore()
  })
})
