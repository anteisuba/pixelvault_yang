import { RetryMesh3DRequestSchema } from '@/types'
import { retryMesh3DGeneration } from '@/services/generate-3d.service'
import { createApiRoute } from '@/lib/api-route-factory'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'

export const maxDuration = 240

/**
 * PR3-α: re-submit Stage 1 (Geometry) for a job currently parked at
 * MESH_READY. Optionally accepts new seed / multi-view images / face budget
 * — the diagnosis dock uses this to act on "脸不对 → 换种子" /
 * "侧视图不对 → 替换侧视图" / "太粗糙 → 提高 face count" flows.
 */
export const POST = createApiRoute({
  schema: RetryMesh3DRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.generateVideo,
  routeName: 'POST /api/generate-3d/retry-mesh',
  handler: async (clerkId, data) => {
    return retryMesh3DGeneration(clerkId, data)
  },
})
