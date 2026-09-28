import 'server-only'

import { FolderMembershipsSchema } from '@/types'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { getFolderMemberships } from '@/services/project.service'
import { createApiRoute } from '@/lib/api-route-factory'

export const POST = createApiRoute({
  schema: FolderMembershipsSchema,
  routeName: 'POST /api/projects/memberships',
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  handler: async (clerkId, data) =>
    getFolderMemberships(clerkId, data.generationIds),
})
