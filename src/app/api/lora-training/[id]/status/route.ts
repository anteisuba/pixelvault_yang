import 'server-only'

import { checkLoraTrainingStatus } from '@/services/lora-training.service'
import { createApiGetByIdRoute } from '@/lib/api-route-factory'

export const GET = createApiGetByIdRoute({
  routeName: 'GET /api/lora-training/[id]/status',
  handler: async (clerkId, id) => checkLoraTrainingStatus(clerkId, id),
})
