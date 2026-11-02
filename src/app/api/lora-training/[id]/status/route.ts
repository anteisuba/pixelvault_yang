import 'server-only'

import { checkLoraTrainingStatus } from '@/features/lora/server'
import { createApiGetByIdRoute } from '@/lib/api-route-factory'

export const GET = createApiGetByIdRoute({
  routeName: 'GET /api/lora-training/[id]/status',
  handler: async (clerkId, id) => checkLoraTrainingStatus(clerkId, id),
})
