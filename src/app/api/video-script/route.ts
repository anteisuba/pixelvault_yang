import 'server-only'

import {
  CreateVideoScriptInputSchema,
  ListVideoScriptsQuerySchema,
} from '@/types/video-script'
import { createApiGetRoute, createApiRoute } from '@/lib/api-route-factory'
import { ensureUser } from '@/services/user.service'
import { generateScript, listByUser } from '@/services/video-script.service'

export const POST = createApiRoute({
  schema: CreateVideoScriptInputSchema,
  routeName: 'POST /api/video-script',
  handler: async (clerkId, data) => {
    const dbUser = await ensureUser(clerkId)
    return generateScript(data, dbUser.id)
  },
})

export const GET = createApiGetRoute({
  schema: ListVideoScriptsQuerySchema,
  routeName: 'GET /api/video-script',
  requireAuth: true,
  handler: async ({ clerkId, data }) => {
    const dbUser = await ensureUser(clerkId!)
    return listByUser(dbUser.id, { page: data.page, size: data.size })
  },
})
