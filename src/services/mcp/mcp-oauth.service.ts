import 'server-only'

import { clerkClient } from '@clerk/nextjs/server'

import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import {
  hashMcpToken,
  toMcpAccess,
  type McpTokenOwner,
} from '@/services/mcp/mcp-token.service'
import {
  MCP_DEFAULT_ACCESS,
  MCP_OAUTH_CONNECTION_NAME_PREFIX,
  MCP_TOKEN_TOUCH_INTERVAL_MS,
  MCP_TOKEN_VISIBLE_SUFFIX_LENGTH,
} from '@/constants/mcp'

/**
 * OAuth 连接（`docs/references/mcp.md` §3.2，S7）：Claude.ai / ChatGPT 这类网页客户端只认 OAuth。
 * 授权服务器 = 本站的 Clerk 实例（它自己出同意页），这里只验它签的访问令牌。
 *
 * ⭐ 每一家（她 × clientId）在令牌表里占一行（`oauthClientId`），和自己生成的令牌排在同一张单子上：
 *   权限照样三档、默认只看；吊销那一行就断开那一家。
 * ⚠ 吊销之后她重新点「连接」同意一次，Clerk 会签一把**更晚**的令牌 —— 比吊销时间晚就当重新连上
 *   （权限回到只看），早于吊销的旧令牌一律拒。
 */

/** Clerk 的 issuer：publishable key 里 base64 着它的前台域名（`clerk.example.com$`）。 */
export function mcpOAuthIssuer(
  publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
): string | null {
  const encoded = publishableKey?.replace(/^pk_(live|test)_/, '')
  if (!encoded) return null
  try {
    const host = Buffer.from(encoded, 'base64')
      .toString('utf8')
      .replace(/\$$/, '')
    return /^[a-z0-9.-]+$/i.test(host) ? `https://${host}` : null
  } catch {
    return null
  }
}

function connectionHash(userId: string, clientId: string): string {
  return hashMcpToken(`oauth:${userId}:${clientId}`)
}

export async function verifyMcpOAuthToken(
  accessToken: string,
  now: Date = new Date(),
): Promise<McpTokenOwner | null> {
  let token: Awaited<
    ReturnType<
      Awaited<ReturnType<typeof clerkClient>>['idPOAuthAccessToken']['verify']
    >
  >
  try {
    token = await (await clerkClient()).idPOAuthAccessToken.verify(accessToken)
  } catch {
    return null
  }
  if (token.revoked || token.expired || !token.subject || !token.clientId)
    return null

  const user = await db.user.findUnique({
    where: { clerkId: token.subject },
    select: { id: true, clerkId: true, isDeleted: true },
  })
  if (!user || user.isDeleted) return null

  const tokenHash = connectionHash(user.id, token.clientId)
  // Clerk 回毫秒；JWT 形态的令牌按 iat 折过来可能是秒。
  const issuedAt = new Date(
    token.createdAt < 1e12 ? token.createdAt * 1000 : token.createdAt,
  )
  const row = await db.mcpToken.findUnique({
    where: { tokenHash },
    select: { id: true, access: true, revokedAt: true, lastUsedAt: true },
  })

  if (row?.revokedAt && issuedAt <= row.revokedAt) return null

  if (!row || row.revokedAt) {
    // 第一次连上，或吊销之后重新同意过：一行、只看。
    const saved = await db.mcpToken.upsert({
      where: { tokenHash },
      create: {
        userId: user.id,
        name: `${MCP_OAUTH_CONNECTION_NAME_PREFIX}${token.clientId.slice(-MCP_TOKEN_VISIBLE_SUFFIX_LENGTH)}`,
        tokenHash,
        last4: token.clientId.slice(-MCP_TOKEN_VISIBLE_SUFFIX_LENGTH),
        oauthClientId: token.clientId,
        access: MCP_DEFAULT_ACCESS,
        lastUsedAt: now,
      },
      update: { revokedAt: null, access: MCP_DEFAULT_ACCESS, lastUsedAt: now },
      select: { id: true, access: true },
    })
    logger.info('[mcp] oauth connection saved', {
      userId: user.id,
      clientId: token.clientId,
    })
    return {
      tokenId: saved.id,
      userId: user.id,
      clerkId: user.clerkId,
      access: toMcpAccess(saved.access),
    }
  }

  const stale =
    !row.lastUsedAt ||
    now.getTime() - row.lastUsedAt.getTime() >= MCP_TOKEN_TOUCH_INTERVAL_MS
  if (stale)
    await db.mcpToken
      .update({ where: { id: row.id }, data: { lastUsedAt: now } })
      .catch(() => undefined)

  return {
    tokenId: row.id,
    userId: user.id,
    clerkId: user.clerkId,
    access: toMcpAccess(row.access),
  }
}
