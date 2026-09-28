import 'server-only'

import { createApiGetByIdRoute } from '@/lib/api-route-factory'
import { getProjectFollowStatus } from '@/services/mcp/mcp-follow.service'

// 开着的画布跟上外部改动（docs/references/mcp.md §6）：版本号 + Claude 是否在剪。
// 不是自己的 / 已删 = 404。

export const GET = createApiGetByIdRoute({
  routeName: 'GET /api/node-workflow/projects/[id]/version',
  handler: async (clerkId, id) => getProjectFollowStatus(clerkId, id),
})
