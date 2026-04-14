import 'server-only'

import { UpdateCharacterCardSchema } from '@/types'
import {
  getCharacterCard,
  updateCharacterCard,
  deleteCharacterCard,
} from '@/services/character-card.service'
import {
  createApiGetByIdRoute,
  createApiPutRoute,
  createApiDeleteRoute,
} from '@/lib/api-route-factory'

export const GET = createApiGetByIdRoute({
  routeName: 'GET /api/character-cards/[id]',
  notFoundMessage: 'Character card not found',
  handler: async (clerkId, id) => getCharacterCard(clerkId, id),
})

export const PUT = createApiPutRoute({
  schema: UpdateCharacterCardSchema,
  routeName: 'PUT /api/character-cards/[id]',
  notFoundMessage: 'Character card not found',
  handler: async (clerkId, id, data) => updateCharacterCard(clerkId, id, data),
})

export const DELETE = createApiDeleteRoute({
  routeName: 'DELETE /api/character-cards/[id]',
  notFoundMessage: 'Character card not found',
  handler: async (clerkId, id) => deleteCharacterCard(clerkId, id),
})
