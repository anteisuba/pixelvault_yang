import 'server-only'

import { z } from 'zod'

import { CreateApiKeySchema } from '@/types'
import { ensureUser } from '@/services/user.service'
import { listUserApiKeys, createApiKey } from '@/services/apiKey.service'
import { createApiGetRoute, createApiRoute } from '@/lib/api-route-factory'

export const GET = createApiGetRoute({
  schema: z.object({}),
  routeName: 'GET /api/api-keys',
  requireAuth: true,
  handler: async ({ clerkId }) => {
    const dbUser = await ensureUser(clerkId!)
    return listUserApiKeys(dbUser.id)
  },
})

export const POST = createApiRoute({
  schema: CreateApiKeySchema,
  routeName: 'POST /api/api-keys',
  handler: async (clerkId, data) => {
    const dbUser = await ensureUser(clerkId)
    return createApiKey(
      dbUser.id,
      data.modelId,
      data.adapterType,
      data.providerConfig,
      data.label,
      data.keyValue,
    )
  },
})
