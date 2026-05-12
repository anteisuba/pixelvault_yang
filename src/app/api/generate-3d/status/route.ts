import 'server-only'

import { createApiGetRoute } from '@/lib/api-route-factory'
import { check3DGenerationStatus } from '@/services/generate-3d.service'
import {
  Model3DStatusRequestSchema,
  type Model3DStatusResponseData,
} from '@/types'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'

export const maxDuration = 240

export const GET = createApiGetRoute<
  typeof Model3DStatusRequestSchema,
  Model3DStatusResponseData
>({
  schema: Model3DStatusRequestSchema,
  routeName: 'GET /api/generate-3d/status',
  requireAuth: true,
  rateLimit: RATE_LIMIT_CONFIGS.longVideoStatus,
  handler: async ({ clerkId, data }) => {
    return check3DGenerationStatus(clerkId!, data.jobId)
  },
})
