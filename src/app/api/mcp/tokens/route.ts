import 'server-only'

import { z } from 'zod'

import { createApiGetRoute, createApiRoute } from '@/lib/api-route-factory'
import { createMcpToken, listMcpTokens } from '@/services/mcp/mcp-token.service'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { CreateMcpTokenRequestSchema } from '@/types/mcp'

// 外部 Claude 的个人令牌：列出 / 生成（docs/references/mcp.md §3.1）。
// ⚠ 走 Clerk 会话 —— 与 `/api/mcp` 本身不同，这两条**不**在 proxy 公开表里。

export const GET = createApiGetRoute({
  schema: z.object({}),
  routeName: 'GET /api/mcp/tokens',
  requireAuth: true,
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  handler: async ({ clerkId }) => listMcpTokens(clerkId!),
})

export const POST = createApiRoute({
  schema: CreateMcpTokenRequestSchema,
  routeName: 'POST /api/mcp/tokens',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, data) => createMcpToken(clerkId, data.name),
})
