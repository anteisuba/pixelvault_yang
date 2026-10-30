import 'server-only'

import {
  createApiDeleteRoute,
  createApiPutRoute,
} from '@/lib/api-route-factory'
import {
  revokeMcpToken,
  updateMcpTokenAccess,
} from '@/services/mcp/mcp-token.service'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { UpdateMcpTokenRequestSchema } from '@/types/mcp'

// 改权限 / 吊销一个令牌（都立即生效）。不是自己的 / 已吊销 = 404。

export const PUT = createApiPutRoute({
  schema: UpdateMcpTokenRequestSchema,
  routeName: 'PUT /api/mcp/tokens/[id]',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id, data) =>
    updateMcpTokenAccess(clerkId, id, data.access),
})

export const DELETE = createApiDeleteRoute({
  routeName: 'DELETE /api/mcp/tokens/[id]',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id) => revokeMcpToken(clerkId, id),
})
