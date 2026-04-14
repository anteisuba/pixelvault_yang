import 'server-only'

import { UpdateApiKeySchema } from '@/types'
import { ensureUser } from '@/services/user.service'
import { updateApiKey, deleteApiKey } from '@/services/apiKey.service'
import { ApiRequestError } from '@/lib/errors'
import {
  createApiPutRoute,
  createApiDeleteRoute,
} from '@/lib/api-route-factory'

export const PUT = createApiPutRoute({
  schema: UpdateApiKeySchema,
  routeName: 'PUT /api/api-keys/[id]',
  handler: async (clerkId, id, data) => {
    const dbUser = await ensureUser(clerkId)
    try {
      return await updateApiKey(id, dbUser.id, data)
    } catch (err) {
      throw new ApiRequestError(
        'ACCESS_DENIED',
        403,
        'errors.apiKeys.accessDenied',
        err instanceof Error ? err.message : 'Update failed',
      )
    }
  },
})

export const DELETE = createApiDeleteRoute({
  routeName: 'DELETE /api/api-keys/[id]',
  handler: async (clerkId, id) => {
    const dbUser = await ensureUser(clerkId)
    try {
      await deleteApiKey(id, dbUser.id)
    } catch (err) {
      throw new ApiRequestError(
        'ACCESS_DENIED',
        403,
        'errors.apiKeys.accessDenied',
        err instanceof Error ? err.message : 'Delete failed',
      )
    }
  },
})
