import 'server-only'

import { ReorderProjectsSchema } from '@/types'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { reorderProjects } from '@/services/project.service'
import { createApiRoute } from '@/lib/api-route-factory'

export const PUT = createApiRoute({
  schema: ReorderProjectsSchema,
  routeName: 'PUT /api/projects/order',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, data) => {
    await reorderProjects(clerkId, data)
    return {}
  },
})
