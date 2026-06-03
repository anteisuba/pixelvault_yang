import 'server-only'

import { createApiGetRoute } from '@/lib/api-route-factory'
import { checkMultiViewGenerationStatus } from '@/services/multiview-generate.service'
import {
  MultiViewStatusRequestSchema,
  type MultiViewStatusResponseData,
} from '@/types'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'

export const maxDuration = 60

export const GET = createApiGetRoute<
  typeof MultiViewStatusRequestSchema,
  MultiViewStatusResponseData
>({
  schema: MultiViewStatusRequestSchema,
  routeName: 'GET /api/generate-multiview/status',
  requireAuth: true,
  rateLimit: RATE_LIMIT_CONFIGS.longVideoStatus,
  handler: async ({ clerkId, data }) => {
    return checkMultiViewGenerationStatus(clerkId!, data)
  },
})
