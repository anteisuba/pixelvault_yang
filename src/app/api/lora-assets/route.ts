import 'server-only'

import { z } from 'zod'

import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import { listLoraAssetsForUser } from '@/services/lora-asset.service'
import { createApiGetRoute } from '@/lib/api-route-factory'

export const GET = createApiGetRoute({
  schema: z.object({}),
  routeName: 'GET /api/lora-assets',
  requireAuth: true,
  rateLimit: RATE_LIMIT_CONFIGS.authedRead,
  handler: async ({ clerkId }) => listLoraAssetsForUser(clerkId!),
})
