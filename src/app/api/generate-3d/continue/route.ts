import { Continue3DRequestSchema } from '@/types'
import { continue3DGeneration } from '@/services/generate-3d.service'
import { createApiRoute } from '@/lib/api-route-factory'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'

export const maxDuration = 240

/**
 * PR3-α: trigger Stage 2 of a staged Hunyuan3D job. The job must already be
 * parked at MESH_READY — i.e. the user has reviewed the geometry preview and
 * wants to commit to texture generation.
 */
export const POST = createApiRoute({
  schema: Continue3DRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.generateVideo,
  routeName: 'POST /api/generate-3d/continue',
  handler: async (clerkId, data) => {
    return continue3DGeneration(clerkId, data)
  },
})
