import { Cancel3DRequestSchema } from '@/types'
import { cancel3DGeneration } from '@/services/generate-3d.service'
import { createApiRoute } from '@/lib/api-route-factory'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'

export const maxDuration = 30

/**
 * PR3-α: abort an in-flight 3D job. Allowed in any non-COMPLETED state;
 * idempotent on already-FAILED jobs. Marks the job FAILED with a
 * CANCELLED_BY_USER sentinel so the status check can surface
 * `cancelled: true` to the client (suppressing the error toast).
 */
export const POST = createApiRoute({
  schema: Cancel3DRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.generateVideo,
  routeName: 'POST /api/generate-3d/cancel',
  handler: async (clerkId, data) => {
    return cancel3DGeneration(clerkId, data)
  },
})
