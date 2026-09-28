import 'server-only'

import { createApiDeleteRoute } from '@/lib/api-route-factory'
import { revokeMcpToken } from '@/services/mcp/mcp-token.service'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'

// 吊销一个令牌（立即生效）。不是自己的 / 已吊销 = 404。

export const DELETE = createApiDeleteRoute({
  routeName: 'DELETE /api/mcp/tokens/[id]',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id) => revokeMcpToken(clerkId, id),
})
