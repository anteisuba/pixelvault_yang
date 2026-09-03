import { Cancel3DRequestSchema } from '@/types'
import { cancel3DGeneration } from '@/services/generate-3d.service'
import { createApiRoute } from '@/lib/api-route-factory'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'

export const maxDuration = 30

/**
 * Abort an in-flight 3D job. Allowed in any non-COMPLETED state; idempotent
 * on already-terminal jobs. CAS-transitions QUEUED/RUNNING jobs to the
 * `CANCELLED` `GenerationJobStatus` — see `cancel3DGenerationForUserId`.
 */
export const POST = createApiRoute({
  schema: Cancel3DRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.generateVideo,
  routeName: 'POST /api/generate-3d/cancel',
  handler: async (clerkId, data) => {
    return cancel3DGeneration(clerkId, data)
  },
})
