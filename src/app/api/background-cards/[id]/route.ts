import 'server-only'

import { UpdateBackgroundCardSchema } from '@/types'
import {
  getBackgroundCard,
  updateBackgroundCard,
  deleteBackgroundCard,
} from '@/services/background-card.service'
import {
  createApiGetByIdRoute,
  createApiPutRoute,
  createApiDeleteRoute,
} from '@/lib/api-route-factory'

export const GET = createApiGetByIdRoute({
  routeName: 'GET /api/background-cards/[id]',
  handler: async (clerkId, id) => getBackgroundCard(clerkId, id),
})

export const PUT = createApiPutRoute({
  schema: UpdateBackgroundCardSchema,
  routeName: 'PUT /api/background-cards/[id]',
  handler: async (clerkId, id, data) => updateBackgroundCard(clerkId, id, data),
})

export const DELETE = createApiDeleteRoute({
  routeName: 'DELETE /api/background-cards/[id]',
  handler: async (clerkId, id) => deleteBackgroundCard(clerkId, id),
})
