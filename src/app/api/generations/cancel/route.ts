import { cancelGenerationsRequestSchema } from '@/types'
import { cancelGenerationJobs } from '@/services/generation-cancel.service'
import { createApiRoute } from '@/lib/api-route-factory'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'

export const maxDuration = 30

/**
 * POST /api/generations/cancel — cross-domain cancel for `GenerationJob`
 * rows (image/video/audio/3D, dispatched through the execution worker).
 * Accepts a batch of jobIds (single-job cancel and "cancel all" both call
 * this with 1..N ids) and reports per-id outcome — see
 * `cancelGenerationJobs` for the ownership/state contract.
 */
export const POST = createApiRoute({
  schema: cancelGenerationsRequestSchema,
  rateLimit: RATE_LIMIT_CONFIGS.generationsCancel,
  routeName: 'POST /api/generations/cancel',
  handler: async (clerkId, data) => {
    return cancelGenerationJobs(clerkId, data.jobIds)
  },
})
