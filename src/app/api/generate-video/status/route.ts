import 'server-only'

import { createApiGetRoute } from '@/lib/api-route-factory'
import { checkVideoGenerationStatus } from '@/services/generate-video.service'
import { VideoStatusRequestSchema, type VideoStatusResponseData } from '@/types'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'

// Next.js segment config exports must stay statically analyzable.
export const maxDuration = 240

// ─── GET /api/generate-video/status?jobId=xxx ────────────────────

export const GET = createApiGetRoute<
  typeof VideoStatusRequestSchema,
  VideoStatusResponseData
>({
  schema: VideoStatusRequestSchema,
  routeName: 'GET /api/generate-video/status',
  requireAuth: true,
  rateLimit: RATE_LIMIT_CONFIGS.longVideoStatus,
  handler: async ({ clerkId, data }) => {
    return checkVideoGenerationStatus(clerkId!, data.jobId)
  },
})
