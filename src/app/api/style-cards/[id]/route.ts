import 'server-only'

import { UpdateStyleCardSchema } from '@/types'
import { RATE_LIMIT_CONFIGS } from '@/constants/config'
import {
  getStyleCard,
  updateStyleCard,
  deleteStyleCard,
} from '@/services/style-card.service'
import {
  createApiGetByIdRoute,
  createApiPutRoute,
  createApiDeleteRoute,
} from '@/lib/api-route-factory'

export const GET = createApiGetByIdRoute({
  routeName: 'GET /api/style-cards/[id]',
  handler: async (clerkId, id) => getStyleCard(clerkId, id),
})

export const PUT = createApiPutRoute({
  schema: UpdateStyleCardSchema,
  routeName: 'PUT /api/style-cards/[id]',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id, data) => updateStyleCard(clerkId, id, data),
})

export const DELETE = createApiDeleteRoute({
  routeName: 'DELETE /api/style-cards/[id]',
  rateLimit: RATE_LIMIT_CONFIGS.authedWrite,
  handler: async (clerkId, id) => deleteStyleCard(clerkId, id),
})
