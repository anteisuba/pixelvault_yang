import 'server-only'

import { z } from 'zod'

import { createApiGetRoute } from '@/lib/api-route-factory'
import { listPendingGenerationRequests } from '@/services/mcp/mcp-generate.service'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'

// 外部 AI 发起、等她在网站上确认的出图（docs/references/mcp.md §4.4）。走 Clerk 会话。

export const GET = createApiGetRoute({
  schema: z.object({}),
  routeName: 'GET /api/mcp/generation-requests',
  requireAuth: true,
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  handler: async ({ clerkId }) => listPendingGenerationRequests(clerkId!),
})
