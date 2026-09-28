import 'server-only'

import { createHash, randomBytes } from 'node:crypto'

import { db } from '@/lib/db'
import { ApiRequestError } from '@/lib/errors'
import { ensureUser } from '@/services/user.service'
import {
  MCP_MAX_ACTIVE_TOKENS,
  MCP_TOKEN_PREFIX,
  MCP_TOKEN_RANDOM_BYTES,
  MCP_TOKEN_TOUCH_INTERVAL_MS,
  MCP_TOKEN_VISIBLE_SUFFIX_LENGTH,
} from '@/constants/mcp'
import type { CreatedMcpToken, McpTokenRecord } from '@/types/mcp'

/**
 * 外部 Claude 连本站用的个人令牌（`docs/references/mcp.md` §3.1）。
 *
 * 整个账号 · 不过期 · 可吊销（owner 2026-09-28）。⚠ 库里只存 SHA-256：明文是
 * 32 字节随机数，高熵串不需要加盐；明文只在生成的那一刻回给用户一次。
 */

/** 有效令牌满了（§3.1 每人最多 10 个）—— 路由工厂按 409 回。 */
export class McpTokenLimitError extends ApiRequestError {
  constructor() {
    super(
      'MCP_TOKEN_LIMIT',
      409,
      'errors.mcp.tokenLimit',
      `At most ${MCP_MAX_ACTIVE_TOKENS} active MCP tokens per account`,
    )
    this.name = 'McpTokenLimitError'
  }
}

/** 令牌对应的人。`clerkId` 让工具层直接复用按 Clerk id 验归属的现成服务。 */
export interface McpTokenOwner {
  readonly tokenId: string
  readonly userId: string
  readonly clerkId: string
}

export function hashMcpToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function toRecord(row: {
  id: string
  name: string
  last4: string
  createdAt: Date
  lastUsedAt: Date | null
}): McpTokenRecord {
  return {
    id: row.id,
    name: row.name,
    last4: row.last4,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  }
}

export async function listMcpTokens(
  clerkId: string,
): Promise<McpTokenRecord[]> {
  const user = await ensureUser(clerkId)
  const rows = await db.mcpToken.findMany({
    where: { userId: user.id, revokedAt: null },
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(toRecord)
}

export async function createMcpToken(
  clerkId: string,
  name: string,
): Promise<CreatedMcpToken> {
  const user = await ensureUser(clerkId)
  const active = await db.mcpToken.count({
    where: { userId: user.id, revokedAt: null },
  })
  if (active >= MCP_MAX_ACTIVE_TOKENS) throw new McpTokenLimitError()

  const token = `${MCP_TOKEN_PREFIX}${randomBytes(MCP_TOKEN_RANDOM_BYTES).toString('base64url')}`
  const row = await db.mcpToken.create({
    data: {
      userId: user.id,
      name,
      tokenHash: hashMcpToken(token),
      last4: token.slice(-MCP_TOKEN_VISIBLE_SUFFIX_LENGTH),
    },
  })
  return { ...toRecord(row), token }
}

/** 吊销。`false` = 不是这个人的、或已经吊销过（路由回 404）。 */
export async function revokeMcpToken(
  clerkId: string,
  tokenId: string,
): Promise<boolean> {
  const user = await ensureUser(clerkId)
  const result = await db.mcpToken.updateMany({
    where: { id: tokenId, userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  return result.count > 0
}

/**
 * 明文 → 令牌主人。认不出 / 已吊销 / 账号已删 = `null`。
 *
 * ⚠ `lastUsedAt` 隔 `MCP_TOKEN_TOUCH_INTERVAL_MS` 才写一次，⛔ 不每次调用都写库；
 * 写失败不影响这次调用（它只是给人看的「最近用过」）。
 */
export async function verifyMcpToken(
  token: string,
  now: Date = new Date(),
): Promise<McpTokenOwner | null> {
  if (!token.startsWith(MCP_TOKEN_PREFIX)) return null

  const row = await db.mcpToken.findUnique({
    where: { tokenHash: hashMcpToken(token) },
    select: {
      id: true,
      revokedAt: true,
      lastUsedAt: true,
      user: { select: { id: true, clerkId: true, isDeleted: true } },
    },
  })
  if (!row || row.revokedAt || row.user.isDeleted) return null

  const stale =
    !row.lastUsedAt ||
    now.getTime() - row.lastUsedAt.getTime() >= MCP_TOKEN_TOUCH_INTERVAL_MS
  if (stale) {
    await db.mcpToken
      .update({ where: { id: row.id }, data: { lastUsedAt: now } })
      .catch(() => undefined)
  }

  return { tokenId: row.id, userId: row.user.id, clerkId: row.user.clerkId }
}
