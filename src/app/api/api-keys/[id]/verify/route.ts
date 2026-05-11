import 'server-only'

import { z } from 'zod'

import { ensureUser } from '@/services/user.service'
import { verifyApiKey } from '@/services/apiKey.service'
import { ApiRequestError } from '@/lib/errors'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { createApiPostByIdRoute } from '@/lib/api-route-factory'

export const POST = createApiPostByIdRoute({
  schema: z.object({}),
  routeName: 'POST /api/api-keys/[id]/verify',
  rateLimit: RATE_LIMIT_CONFIGS.outboundProbe,
  handler: async (clerkId, id) => {
    const dbUser = await ensureUser(clerkId)
    try {
      return await verifyApiKey(id, dbUser.id)
    } catch (err) {
      throw new ApiRequestError(
        'ACCESS_DENIED',
        403,
        'errors.apiKeys.accessDenied',
        err instanceof Error ? err.message : 'Verification failed',
      )
    }
  },
})
