import 'server-only'

import { createApiGetRoute } from '@/lib/api-route-factory'
import { checkImageGenerationStatus } from '@/services/image/submit-image.service'
import { AudioStatusRequestSchema, type ImageStatusResponseData } from '@/types'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'

// Next.js segment config exports must stay statically analyzable.
export const maxDuration = 60

// ─── GET /api/studio/generate/status?jobId=xxx ───────────────────

export const GET = createApiGetRoute<
  typeof AudioStatusRequestSchema,
  ImageStatusResponseData
>({
  schema: AudioStatusRequestSchema,
  routeName: 'GET /api/studio/generate/status',
  requireAuth: true,
  rateLimit: RATE_LIMIT_CONFIGS.longVideoStatus,
  handler: async ({ clerkId, data }) => {
    return checkImageGenerationStatus(clerkId!, data.jobId)
  },
})
