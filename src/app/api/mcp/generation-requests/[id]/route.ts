import 'server-only'

import { createApiPutRoute } from '@/lib/api-route-factory'
import { decideGenerationRequestForClerkId } from '@/services/mcp/mcp-generate.service'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { DecideMcpGenerationRequestSchema } from '@/types/mcp'

// 她在网站上点「出图 / 不出」。只有第一下算；不是她的 = 404。确认这一下才真的出图。

export const PUT = createApiPutRoute({
  schema: DecideMcpGenerationRequestSchema,
  routeName: 'PUT /api/mcp/generation-requests/[id]',
  rateLimit: RATE_LIMIT_CONFIGS.generate,
  handler: async (clerkId, id, data) =>
    decideGenerationRequestForClerkId(clerkId, id, data.decision),
})
